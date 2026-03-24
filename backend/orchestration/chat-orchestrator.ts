/**
 * Chat orchestrator: maps user intents to existing backend functions.
 * Always uses the provided userId from JWT — never falls back to 'default'.
 */
import { getProfile, updateProfile } from '../data/profile.js';
import {
  getOnboardingComplete,
  setOnboardingComplete,
  getAutomationLevel,
  hasTranscript,
} from '../data/user-preferences.js';
import { extractProfileFromResumeText } from '../shared/profile-from-resume.js';
import { getSessionAge } from '../data/handshake-session.js';
import { createPipelineJob, listPipelineJobs, getPipelineJob, cancelPipelineJob } from '../data/pipeline-jobs.js';
import { runJobScraper } from '../agents/job_scraper_agent/index.js';
import { checkJobProfileMismatch } from '../shared/job-profile-mismatch.js';
import { getApplyFormSchema } from '../data/apply-forms.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from '../shared/job-from-url.js';
import { extractProfileUpdateFromMessage } from '../shared/profile-update-from-chat.js';
import { runPipelineInBackground, resumePipelineAfterApproval } from './run-pipeline-background.js';
import { listJobsWithStatus } from './list-jobs-with-status.js';
import { findJobs } from '../job-finders/registry.js';
import { isAppError, CODES, messageForCode, type AppErrorCode } from '../shared/errors.js';
import { SESSION_STALE_THRESHOLD_MS } from '../shared/constants.js';
import { normalizePipelineOutcome, getPipelineOutcomeMessage } from '../shared/pipeline-outcome.js';
import { getUserSubscriptionStatus } from '../api/db.js';
import type {
  Profile,
  ChatMessage,
  OrchestratorResult,
  JobProfileMismatchResult,
  Intent,
} from '../shared/types.js';
import { detectIntentFromLLM } from '../shared/intent-from-llm.js';

export type { ChatMessage, OrchestratorResult } from '../shared/types.js';

const HANDSHAKE_URL_RE = /joinhandshake\.com\/(jobs|job-search)\/\d+/i;
const URL_RE = /https?:\/\/\S+/i;

function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();

  if (
    lower.includes('connect handshake') ||
    lower.includes('link handshake') ||
    lower.includes('extension') ||
    lower.includes('get token') ||
    lower.includes('copy token')
  ) {
    return 'connect_handshake';
  }

  if (
    lower.includes('check status') ||
    lower.includes('is it done') ||
    lower.includes('application status') ||
    lower.includes('my application') ||
    lower.includes('is my application') ||
    lower.includes('pipeline status') ||
    lower.includes('any update')
  ) {
    return 'check_status';
  }

  if (
    lower.includes('find jobs') ||
    lower.includes('discover jobs') ||
    lower.includes('new handshake jobs') ||
    lower.includes('find me jobs') ||
    lower.includes('show me new jobs')
  ) {
    return 'find_jobs';
  }

  if (
    lower.includes('list jobs') ||
    lower.includes('my jobs') ||
    lower.includes('show jobs') ||
    lower.includes('applied jobs') ||
    lower.includes('job list')
  ) {
    return 'list_jobs';
  }

  if (
    lower.trim() === 'approve' ||
    lower.includes('approve and apply') ||
    lower.includes('yes, apply') ||
    lower.includes('go ahead and apply')
  ) {
    return 'approve';
  }

  if (
    lower.trim() === 'cancel' ||
    lower.includes('cancel apply') ||
    lower.includes("don't apply") ||
    lower.includes('never mind')
  ) {
    return 'cancel';
  }

  if (
    lower.includes('update profile') ||
    lower.includes('change my') ||
    lower.includes('edit profile') ||
    lower.includes('update my')
  ) {
    return 'update_profile';
  }

  if (HANDSHAKE_URL_RE.test(message) || (URL_RE.test(message) && lower.includes('apply'))) {
    return 'apply';
  }

  if (
    message.length > 200 ||
    lower.includes('resume') ||
    lower.includes('my profile') ||
    lower.includes('set profile') ||
    lower.includes('here is my')
  ) {
    return 'set_profile';
  }

  if (lower.includes('help') || lower === 'hi' || lower === 'hello' || lower === 'hey') {
    return 'help';
  }

  if (HANDSHAKE_URL_RE.test(message) || URL_RE.test(message)) {
    return 'apply';
  }

  return 'help';
}

function extractUrl(message: string): string | null {
  const match = message.match(/https?:\/\/\S+/i);
  return match ? match[0].replace(/[.,;!?)]+$/, '') : null;
}

function profileSummary(p: Profile): string {
  const parts: string[] = [];
  if (p.name) parts.push(`Name: ${p.name}`);
  if (p.email) parts.push(`Email: ${p.email}`);
  if (Array.isArray(p.education) && p.education.length > 0) {
    parts.push(`Education: ${p.education.map((e) => e.degree || e.school || '').filter(Boolean).join(', ')}`);
  }
  if (Array.isArray(p.experience) && p.experience.length > 0) {
    parts.push(`Experience: ${p.experience.length} entries`);
  }
  const skills = p.skills;
  if (skills) {
    if (Array.isArray(skills) && skills.length > 0) {
      parts.push(`Skills: ${skills.length} items`);
    } else if (typeof skills === 'object' && Object.keys(skills).length > 0) {
      parts.push(`Skills: ${Object.keys(skills).length} categories`);
    }
  }
  return parts.join('\n');
}

export async function checkPrerequisites(userId: string): Promise<{
  hasProfile: boolean;
  hasSession: boolean;
  sessionStale: boolean;
  hasTranscript: boolean;
}> {
  const [profile, sessionAge, transcriptResult] = await Promise.all([
    getProfile(userId),
    getSessionAge(userId),
    hasTranscript(userId),
  ]);
  const hasProfile = !!(profile?.name?.trim());
  const hasSession = sessionAge !== null;
  const sessionStale = hasSession && sessionAge! > SESSION_STALE_THRESHOLD_MS;
  return { hasProfile, hasSession, sessionStale, hasTranscript: transcriptResult.hasTranscript };
}

function looksLikeSkipOrContinue(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return (
    lower === 'skip' ||
    lower === 'continue' ||
    lower === 'no' ||
    lower.startsWith('skip,') ||
    lower.startsWith('no,') ||
    lower.includes('skip for now') ||
    lower.includes("don't have") ||
    lower.includes("don't need")
  );
}

async function handleOnboarding(userId: string, message: string): Promise<OrchestratorResult | null> {
  const intent = detectIntent(message);
  if (intent !== 'help') return null;

  const { hasProfile, hasSession, sessionStale, hasTranscript: userHasTranscript } = await checkPrerequisites(userId);

  if (!hasProfile && !hasSession) {
    return {
      reply:
        'Welcome! To get started, I need two things:\n' +
        '1. Paste your resume text so I can learn about you.\n' +
        '2. Connect your Handshake account using the browser extension.\n\n' +
        "Let's start with your resume — paste it here.",
    };
  }
  if (hasProfile && !hasSession) {
    return {
      reply:
        'Welcome back! I have your profile on file. ' +
        'To apply to jobs, please connect Handshake using the browser extension.',
    };
  }
  if (!hasProfile && hasSession) {
    return {
      reply:
        'I see you have connected Handshake, but I do not have your profile yet. ' +
        'Please paste your resume text so I can set it up.',
    };
  }
  if (hasProfile && sessionStale) {
    return {
      reply:
        'Welcome back! Your Handshake session may be expired (last updated more than 7 days ago). ' +
        'Please reconnect using the browser extension before applying. ' +
        'Or send me a job URL and I will try anyway.',
    };
  }
  if (hasProfile && hasSession && !userHasTranscript) {
    if (looksLikeSkipOrContinue(message)) {
      await setOnboardingComplete(userId);
      return {
        reply:
          "You're all set. Send me a job URL and I'll start applying. " +
          'You can upload a transcript later in Settings if a job requires it. ' +
          'Say "list jobs" or ask me to update your profile anytime.',
      };
    }
    return {
      reply:
        "You're almost set. Some jobs ask for a transcript — upload yours now (use the Upload transcript button or Settings) so we can attach it when needed, or say \"skip\" to continue.",
      meta: { onboardingComplete: false },
    };
  }
  return {
    reply:
      "Welcome back! You're all set. Send me a job URL and I'll start applying. " +
      'You can also say "list jobs" to see your applied jobs, or ask me to update your profile.',
  };
}

async function handleSetProfile(userId: string, message: string): Promise<OrchestratorResult> {
  try {
    const profile = await extractProfileFromResumeText(message);
    await updateProfile(profile, userId);
    const summary = profileSummary(profile);
    return {
      reply: `I've extracted and saved your profile. Here's a summary:\n\n${summary}\n\nYou can ask me to update anything, or send a job URL to start applying.`,
    };
  } catch (err) {
    if (err instanceof Error && (err.message.includes('OPENAI_API_KEY') || err.message.includes('apiKey'))) {
      console.error('Profile extraction failed: missing API key', err.message);
      return { reply: 'Resume extraction is temporarily unavailable. Please try again later.' };
    }
    console.error('Profile extraction failed:', err);
    return { reply: 'I had trouble extracting your profile. Please try pasting your resume text again.' };
  }
}

async function handleUpdateProfile(userId: string, message: string): Promise<OrchestratorResult> {
  const profile = await getProfile(userId);
  if (!profile?.name?.trim()) {
    return { reply: "I don't have your profile yet. Please paste your resume text first so I can set it up." };
  }

  const update = await extractProfileUpdateFromMessage(profile, message);
  const keys = Object.keys(update);
  if (keys.length === 0) {
    return {
      reply:
        "I couldn't understand what to add. Try: 'Add my army status: veteran' or 'Change my email to x@example.com'.",
    };
  }

  try {
    await updateProfile(update, userId);
    const fieldNames = keys.join(', ');
    return { reply: `I've updated your profile (${fieldNames}).` };
  } catch (err) {
    console.error('Profile update failed:', err);
    return { reply: 'I had trouble saving your profile. Please try again.' };
  }
}

function formatMismatchPrefix(mismatch: JobProfileMismatchResult | null | undefined): string {
  if (!mismatch?.hasMismatch || !mismatch.reason) return '';
  const severity = mismatch.severity ?? 'warning';
  const label =
    severity === 'blocker' ? 'Blocker' : severity === 'warning' ? 'Warning' : 'Note';
  return `${label}: ${mismatch.reason}\n\n`;
}

function shouldRequireConfirmation(mismatch: JobProfileMismatchResult | null | undefined): boolean {
  if (!mismatch?.hasMismatch) return false;
  if (mismatch.requiresConfirmation === true) return true;
  return mismatch.severity === 'blocker';
}

async function handleApply(
  userId: string,
  message: string,
  options: { skipMismatchConfirmation?: boolean } = {}
): Promise<OrchestratorResult> {
  const url = extractUrl(message);
  if (!url) {
    return { reply: 'Please send me a valid Handshake job URL so I can start the application.' };
  }
  if (getJobSiteFromUrl(url) !== 'handshake') {
    return {
      reply:
        "I only support applying to jobs on Handshake. Please send a Handshake job link (e.g. from your school's Handshake page).",
    };
  }

  const { hasProfile, hasSession, sessionStale } = await checkPrerequisites(userId);
  if (!hasProfile) {
    return { reply: "I don't have your profile yet. Please paste your resume text first before applying." };
  }
  if (!hasSession) {
    return { reply: 'You have not connected Handshake yet. Please install the browser extension and connect first.' };
  }
  if (sessionStale) {
    return {
      reply:
        'Your Handshake session may be expired (last updated more than 7 days ago). ' +
        'Please reconnect using the browser extension, then try again.',
    };
  }

  const running = await listPipelineJobs(userId, 5);
  const alreadyRunning = running.find(
    (j) => j.job_url === url && (j.status === 'pending' || j.status === 'running')
  );
  if (alreadyRunning) {
    return {
      reply: 'I am already working on this job. You can ask me for a status update.',
      meta: { jobId: alreadyRunning.id, pollStatus: true },
    };
  }

  // If this job requires a transcript and the user has not uploaded one, block and ask for it.
  const normalizedUrl = toHandshakeJobDetailsUrl(url);
  const jobIdFromUrl = getJobIdFromUrl(normalizedUrl);
  if (jobIdFromUrl) {
    const cached = getApplyFormSchema(jobIdFromUrl);
    const presentSections = cached?.presentSections as Array<{ key: string }> | undefined;
    const requiredKeys = Array.isArray(presentSections) ? presentSections.map((s) => s.key) : [];
    if (requiredKeys.includes('transcript')) {
      const transcriptStatus = await hasTranscript(userId);
      if (!transcriptStatus.hasTranscript) {
        return {
          reply:
            'This job requires a transcript. Please upload your transcript (PDF) first — use "Upload transcript" in the header, or in Settings. Then send this job URL again and I\'ll apply.',
        };
      }
    }
  }

  const automationLevel = await getAutomationLevel(userId);

  let mismatch: JobProfileMismatchResult | null = null;
  try {
    const profile = await getProfile(userId);
    const { job } = await runJobScraper(url, { forceScrape: false, userId });
    if (job.jobClosed === true) {
      return { reply: 'This job posting appears to be closed.' };
    }
    if (job.applyType === 'apply_externally') {
      return { reply: messageForCode(CODES.APPLY_EXTERNALLY) };
    }
    mismatch = await checkJobProfileMismatch(profile ?? {}, job);
  } catch (err) {
    if (isAppError(err) && err.code === CODES.SCRAPE_LOGIN_WALL) {
      return { reply: err.message };
    }
    // Ignore other scrape errors; proceed with apply (legacy behavior)
  }

  const mismatchPrefix = formatMismatchPrefix(mismatch);
  const requireConfirmation = !options.skipMismatchConfirmation && shouldRequireConfirmation(mismatch);

  if (requireConfirmation) {
    const question =
      automationLevel === 'full'
        ? 'This looks like a serious mismatch for a full-auto application. Do you still want me to apply for you automatically? Reply "yes" to proceed or "no" to skip this job.'
        : 'This looks like a serious mismatch. Do you still want me to generate a tailored resume and cover letter for this job for you to review before applying? Reply "yes" to proceed or "no" to skip this job.';
    return {
      reply: mismatchPrefix + question,
    };
  }

  try {
    if (automationLevel === 'full') {
      const sub = await getUserSubscriptionStatus(userId);
      if (sub.subscription_status !== 'pro') {
        return {
          reply:
            'Upgrade to Pro to enable auto-submission. Pro submits the completed form for you automatically.',
        };
      }
    }

    const { id: jobId } = await createPipelineJob(userId, url, {
      submit: true,
      automationLevel,
    });
    setImmediate(() => void runPipelineInBackground(jobId));
    const reviewNote =
      automationLevel === 'review'
        ? " I'll generate your resume and cover letter, then pause so you can review and approve in the panel. "
        : ' ';
    return {
      reply:
        mismatchPrefix +
        `I've started applying to this job.${reviewNote}` +
        `This usually takes 1-2 minutes. I'll keep you posted — you can also ask "check status" anytime.`,
      meta: { jobId, pollStatus: true },
    };
  } catch (err) {
    console.error('Failed to create pipeline job:', err);
    return { reply: 'Something went wrong while starting the application. Please try again.' };
  }
}

async function handleCheckStatus(userId: string, message: string): Promise<OrchestratorResult> {
  const jobIdMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

  if (jobIdMatch) {
    const job = await getPipelineJob(jobIdMatch[0], userId);
    if (!job) return { reply: 'I could not find that job. It may belong to another user or not exist.' };
    return formatJobStatus(job);
  }

  const recent = await listPipelineJobs(userId, 1);
  if (recent.length === 0) {
    return { reply: "You don't have any pipeline jobs yet. Send me a job URL to start applying." };
  }

  return formatJobStatus(recent[0]);
}

function formatJobStatus(job: {
  id: string;
  status: string;
  job_url: string;
  result: unknown;
  error: string | null;
  error_code?: string | null;
}): OrchestratorResult {
  const stillRunning = job.status === 'pending' || job.status === 'running';

  if (job.status === 'done') {
    const result = job.result as Record<string, unknown> | null;
    const outcome = normalizePipelineOutcome(result);
    const jobTitle = String((result?.job as Record<string, unknown>)?.title ?? job.job_url ?? '');
    const reply = outcome
      ? getPipelineOutcomeMessage(outcome, jobTitle)
      : `The pipeline finished for "${jobTitle}".`;
    return { reply };
  }

  if (job.status === 'failed') {
    if (job.error_code) {
      const msg = messageForCode(job.error_code as AppErrorCode);
      return { reply: msg };
    }
    const errorMsg = job.error ?? 'Unknown error';
    let userFriendly = 'The application failed. ';
    if (errorMsg.includes('Session expired') || errorMsg.includes('not logged in') || errorMsg.includes('login')) {
      userFriendly += 'Your Handshake session has expired. Please reconnect using the browser extension.';
    } else if (errorMsg.includes('OPENAI_API_KEY') || errorMsg.includes('apiKey')) {
      userFriendly += 'Resume generation is temporarily unavailable. Please try again later.';
    } else if (errorMsg.includes('Apply externally') || errorMsg.includes('APPLY_EXTERNALLY')) {
      userFriendly += 'This job requires an external application and cannot be applied to on Handshake.';
    } else if (errorMsg.includes('closed') || errorMsg.includes('no longer')) {
      userFriendly += 'This job posting appears to be closed.';
    } else {
      userFriendly += `Error: ${errorMsg}`;
    }
    return { reply: userFriendly };
  }

  if (job.status === 'awaiting_approval') {
    return {
      reply:
        "I've generated your resume and cover letter. You can edit them in the review panel, then approve to have me apply or cancel to apply manually.",
      meta: { jobId: job.id, pollStatus: true },
    };
  }

  if (job.status === 'cancelled') {
    return { reply: 'That application was cancelled.' };
  }

  return {
    reply: `Your application is still ${job.status}. I'll let you know when it's done.`,
    meta: { jobId: job.id, pollStatus: stillRunning },
  };
}

async function handleFindJobs(userId: string): Promise<OrchestratorResult> {
  const { hasSession, sessionStale } = await checkPrerequisites(userId);
  if (!hasSession) {
    return {
      reply: 'You have not connected Handshake yet. Please install the browser extension and connect first. Then say "find jobs" again.',
    };
  }
  if (sessionStale) {
    return {
      reply:
        'Your Handshake session may be expired (last updated more than 7 days ago). Please reconnect using the browser extension, then try "find jobs" again.',
    };
  }
  try {
    const listings = await findJobs(userId, { site: 'handshake', maxResults: 20 });
    if (listings.length === 0) {
      return { reply: 'No jobs found. Try adjusting filters on Handshake or check back later.' };
    }
    const lines = listings.slice(0, 20).map((j, i) => {
      const title = j.title || 'Untitled';
      const company = j.company ? ` at ${j.company}` : '';
      return `${i + 1}. **${title}**${company} — ${j.url}`;
    });
    return {
      reply:
        `I found ${listings.length} job(s) on Handshake:\n\n${lines.join('\n')}\n\n` +
        'Send me a job URL from the list above to apply, or paste any Handshake job link.',
    };
  } catch (err) {
    if (isAppError(err) && (err.code === CODES.NO_SESSION || err.code === CODES.SESSION_EXPIRED)) {
      return {
        reply:
          err.code === CODES.NO_SESSION
            ? 'Connect Handshake first. Use the browser extension to upload your session.'
            : 'Handshake session expired. Please reconnect using the browser extension.',
      };
    }
    console.error('Find jobs failed:', err);
    return { reply: 'I had trouble loading jobs from Handshake. Please try again.' };
  }
}

async function handleListJobs(userId: string): Promise<OrchestratorResult> {
  try {
    const jobs = await listJobsWithStatus(userId);
    if (jobs.length === 0) {
      return { reply: "You don't have any jobs yet. Send me a Handshake job URL to get started." };
    }
    const lines = jobs.slice(0, 20).map((j, i) => {
      const title = j.job.title || 'Untitled';
      const company = j.job.company || '';
      const status = j.appliedAt ? `Applied ${j.appliedAt}` : j.hasResume ? 'Resume ready' : 'Scraped';
      return `${i + 1}. **${title}** at ${company} — ${status}`;
    });
    return { reply: `Here are your recent jobs:\n\n${lines.join('\n')}` };
  } catch (err) {
    console.error('Failed to list jobs:', err);
    return { reply: 'I had trouble loading your jobs. Please try again.' };
  }
}

function handleConnectHandshake(): OrchestratorResult {
  return {
    reply:
      'To connect Handshake:\n\n' +
      '1. Install the browser extension (your admin will share the link).\n' +
      '2. Log in to Handshake in your browser.\n' +
      '3. Click the extension icon and hit "Send Cookies".\n\n' +
      'The extension needs your API token to authenticate. ' +
      'You can copy it from the header of this chat (look for the "Copy Token" button).\n\n' +
      'Once connected, send me a job URL and I\'ll apply for you.',
  };
}

function findLastAssistantMessage(history: ChatMessage[]): ChatMessage | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') return history[i];
  }
  return null;
}

function findLastApplyUserMessage(history: ChatMessage[]): ChatMessage | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'user') continue;
    if (HANDSHAKE_URL_RE.test(m.content) || URL_RE.test(m.content)) {
      return m;
    }
  }
  return null;
}

function looksLikeYes(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return (
    lower === 'yes' ||
    lower === 'y' ||
    lower.startsWith('yes,') ||
    lower.startsWith('yeah') ||
    lower.startsWith('yep') ||
    lower.startsWith('sure') ||
    lower.startsWith('go ahead') ||
    lower.includes('proceed') ||
    lower.includes('continue')
  );
}

function looksLikeNo(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return (
    lower === 'no' ||
    lower === 'n' ||
    lower.startsWith("don't") ||
    lower.startsWith('dont') ||
    lower.startsWith('no,') ||
    lower.includes('stop') ||
    lower.includes('cancel') ||
    lower.includes('skip') ||
    lower.includes('not apply')
  );
}

function getPendingMismatchConfirmation(
  history: ChatMessage[]
): { originalApplyMessage: string } | null {
  const lastAssistant = findLastAssistantMessage(history);
  if (!lastAssistant) return null;

  const content = lastAssistant.content.toLowerCase();
  const isMismatchPrompt =
    content.includes('serious mismatch') &&
    content.includes('reply "yes" to proceed') &&
    content.includes('reply "yes" to proceed or "no" to skip this job.');

  if (!isMismatchPrompt) return null;

  const lastApply = findLastApplyUserMessage(history);
  if (!lastApply) return null;

  return { originalApplyMessage: lastApply.content };
}

async function handleApprove(userId: string): Promise<OrchestratorResult> {
  const jobs = await listPipelineJobs(userId, 20);
  const awaiting = jobs.find((j) => j.status === 'awaiting_approval');
  if (!awaiting) {
    return {
      reply:
        "I don't have any applications waiting for approval. Send me a job URL to start one, or check status to see current jobs.",
    };
  }
  await resumePipelineAfterApproval(awaiting.id);
  return {
    reply: "Approved. I'm applying now — I'll let you know when it's done.",
    meta: { jobId: awaiting.id, pollStatus: true },
  };
}

async function handleCancel(userId: string): Promise<OrchestratorResult> {
  const jobs = await listPipelineJobs(userId, 10);
  const inProgress = jobs.filter((j) => j.status === 'pending' || j.status === 'running');
  if (inProgress.length === 0) {
    return {
      reply:
        "No problem. You can use the Cancel button in the review panel, or just leave it — you can still download the resume and cover letter to apply manually.",
    };
  }
  const job = inProgress[0];
  const cancelled = await cancelPipelineJob(job.id, userId);
  if (cancelled) {
    return { reply: "I've cancelled that application.", meta: { jobId: job.id } };
  }
  return { reply: "That application has already finished or couldn't be cancelled." };
}

function handleHelp(): OrchestratorResult {
  return {
    reply:
      "Here's what I can do:\n\n" +
      '- **Apply to a job** — Send me a Handshake job URL\n' +
      '- **Check status** — Ask "check status" to see how your application is going\n' +
      '- **Approve** — Say "approve" to apply after reviewing resume and cover letter\n' +
      '- **Set up profile** — Paste your resume text\n' +
      '- **List jobs** — Say "list jobs" to see your applied jobs\n' +
      '- **Connect Handshake** — Say "connect handshake" for setup instructions\n\n' +
      'What would you like to do?',
  };
}

export async function runOrchestrator(
  userId: string,
  message: string,
  history: ChatMessage[] = []
): Promise<OrchestratorResult> {
  if (!userId) throw new Error('userId required');

  // If the last turn asked the user to confirm a serious mismatch, interpret this
  // short reply as yes/no before doing normal intent detection.
  const pendingConfirm = getPendingMismatchConfirmation(history);
  if (pendingConfirm && (looksLikeYes(message) || looksLikeNo(message))) {
    if (looksLikeNo(message)) {
      return {
        reply: 'Okay, I will skip this job and not start an application.',
      };
    }
    // User confirmed "yes" – rerun apply flow for the original message, but
    // skip mismatch confirmation this time so we actually start the pipeline.
    return handleApply(userId, pendingConfirm.originalApplyMessage, {
      skipMismatchConfirmation: true,
    });
  }

  let intent: Intent;
  let resolvedUrl: string | null = null;

  if (HANDSHAKE_URL_RE.test(message)) {
    intent = 'apply';
    resolvedUrl = extractUrl(message);
  } else if (process.env.OPENAI_API_KEY) {
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
    const result = await detectIntentFromLLM(message, {
      lastAssistantMessage: lastAssistant?.content,
    });
    intent = result.intent;
    resolvedUrl = result.url ?? null;
  } else {
    intent = detectIntent(message);
    if (intent === 'apply') resolvedUrl = extractUrl(message);
  }

  if (intent === 'help') {
    const onboardingComplete = await getOnboardingComplete(userId);
    if (!onboardingComplete) {
      const onboarding = await handleOnboarding(userId, message);
      if (onboarding) {
        if (onboarding.meta?.onboardingComplete !== false) {
          await setOnboardingComplete(userId);
        }
        return onboarding;
      }
    }
  }

  switch (intent) {
    case 'connect_handshake':
      return handleConnectHandshake();
    case 'set_profile':
      return handleSetProfile(userId, message);
    case 'update_profile':
      return handleUpdateProfile(userId, message);
    case 'apply':
      return handleApply(userId, resolvedUrl ?? message);
    case 'check_status':
      return handleCheckStatus(userId, message);
    case 'list_jobs':
      return handleListJobs(userId);
    case 'find_jobs':
      return handleFindJobs(userId);
    case 'approve':
      return handleApprove(userId);
    case 'cancel':
      return handleCancel(userId);
    case 'help':
    default:
      return handleHelp();
  }
}
