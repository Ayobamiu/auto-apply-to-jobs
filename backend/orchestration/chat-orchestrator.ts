/**
 * Chat orchestrator: maps user intents to existing backend functions.
 * Always uses the provided userId from JWT — never falls back to 'default'.
 */
import { getProfile, updateProfile } from '../data/profile.js';
import { extractProfileFromResumeText } from '../shared/profile-from-resume.js';
import { getSessionAge } from '../data/handshake-session.js';
import { createPipelineJob, listPipelineJobs, getPipelineJob } from '../data/pipeline-jobs.js';
import { runPipelineInBackground } from './run-pipeline-background.js';
import { listJobsWithStatus } from './list-jobs-with-status.js';
import { isAppError, CODES } from '../shared/errors.js';
import { SESSION_STALE_THRESHOLD_MS } from '../shared/constants.js';
import type { Profile } from '../shared/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrchestratorResult {
  reply: string;
  meta?: {
    jobId?: string;
    pollStatus?: boolean;
  };
}

type Intent =
  | 'connect_handshake'
  | 'set_profile'
  | 'update_profile'
  | 'apply'
  | 'check_status'
  | 'list_jobs'
  | 'help';

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
    lower.includes('list jobs') ||
    lower.includes('my jobs') ||
    lower.includes('show jobs') ||
    lower.includes('applied jobs') ||
    lower.includes('job list')
  ) {
    return 'list_jobs';
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

async function checkPrerequisites(userId: string): Promise<{ hasProfile: boolean; hasSession: boolean; sessionStale: boolean }> {
  const profile = await getProfile(userId);
  const hasProfile = !!(profile?.name?.trim());
  const sessionAge = await getSessionAge(userId);
  const hasSession = sessionAge !== null;
  const sessionStale = hasSession && sessionAge! > SESSION_STALE_THRESHOLD_MS;
  return { hasProfile, hasSession, sessionStale };
}

async function handleOnboarding(userId: string, message: string): Promise<OrchestratorResult | null> {
  const intent = detectIntent(message);
  if (intent !== 'help') return null;

  const { hasProfile, hasSession, sessionStale } = await checkPrerequisites(userId);

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
  return {
    reply:
      "To update your profile, please tell me what you'd like to change. For example:\n" +
      '- "Change my email to john@example.com"\n' +
      '- "Add Python to my skills"\n' +
      '- "Update my summary to ..."\n\n' +
      'For now, please use the API directly (PUT /profile) to make changes. ' +
      'Conversational profile editing is coming soon.',
  };
}

async function handleApply(userId: string, message: string): Promise<OrchestratorResult> {
  const url = extractUrl(message);
  if (!url) {
    return { reply: 'Please send me a valid Handshake job URL so I can start the application.' };
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

  try {
    const { id: jobId } = await createPipelineJob(userId, url, { submit: true });
    setImmediate(() => void runPipelineInBackground(jobId));
    return {
      reply:
        `I've started applying to this job. This usually takes 1-2 minutes. ` +
        `I'll keep you posted — you can also ask "check status" anytime.`,
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
}): OrchestratorResult {
  const stillRunning = job.status === 'pending' || job.status === 'running';

  if (job.status === 'done') {
    const result = job.result as Record<string, unknown> | null;
    const applied = result?.applied || result?.skipped;
    const jobTitle = (result?.job as Record<string, unknown>)?.title ?? job.job_url;
    return {
      reply: applied
        ? `Done! Your application to "${jobTitle}" has been submitted successfully.`
        : `The pipeline finished for "${jobTitle}". Resume was generated but the application was not submitted (submit was not enabled or the job was skipped).`,
    };
  }

  if (job.status === 'failed') {
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

  return {
    reply: `Your application is still ${job.status}. I'll let you know when it's done.`,
    meta: { jobId: job.id, pollStatus: stillRunning },
  };
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

function handleHelp(): OrchestratorResult {
  return {
    reply:
      "Here's what I can do:\n\n" +
      '- **Apply to a job** — Send me a Handshake job URL\n' +
      '- **Check status** — Ask "check status" to see how your application is going\n' +
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

  const isFirstMessage = history.length === 0;
  const intent = detectIntent(message);

  if (isFirstMessage && intent === 'help') {
    const onboarding = await handleOnboarding(userId, message);
    if (onboarding) return onboarding;
  }

  switch (intent) {
    case 'connect_handshake':
      return handleConnectHandshake();
    case 'set_profile':
      return handleSetProfile(userId, message);
    case 'update_profile':
      return handleUpdateProfile(userId, message);
    case 'apply':
      return handleApply(userId, message);
    case 'check_status':
      return handleCheckStatus(userId, message);
    case 'list_jobs':
      return handleListJobs(userId);
    case 'help':
    default:
      return handleHelp();
  }
}
