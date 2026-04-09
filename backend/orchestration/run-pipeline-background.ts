/**
 * Background runner for async pipeline jobs.
 * Loads a pipeline_jobs row, runs the pipeline, updates the row with result or error.
 * When automation_level is review, pipeline may pause (awaiting_approval); approve runs apply step only.
 */
import { existsSync } from 'fs';
import { getPipelineJobById, updatePipelineJobStatus, updatePipelineJobPhase, updatePipelineJobSubmit } from '../data/pipeline-jobs.js';
import { runPipelineForJob, JOB_CANCELLED_ERROR } from './run-pipeline.js';
import { getJobIdFromUrl, getJobSiteFromUrl } from '../shared/job-from-url.js';
import { setJobLifecycleStatus, toJobRef } from '../data/user-job-state.js';
import { ensureResumePdfFromDb } from '../agents/resume_generator_agent/export-pdf.js';
import { ensureCoverLetterPdfFromDb } from '../agents/resume_generator_agent/cover-letter.js';
import { runHandshakeApply } from '../handshake/apply.js';
import { getJob } from '../data/jobs.js';
import { getResumeForJob, getCoverLetterForJob } from '../data/job-artifacts.js';
import { getTranscriptPath } from '../shared/config.js';
import { isAppError, CODES } from '../shared/errors.js';

export type RunPipelineFn = typeof runPipelineForJob;

export async function runPipelineInBackground(
  jobId: string,
  pipelineFn: RunPipelineFn = runPipelineForJob
): Promise<void> {
  const job = await getPipelineJobById(jobId);
  if (!job || job.status !== 'pending') return;

  await updatePipelineJobStatus(jobId, 'running');

  // Mark job as in_progress in lifecycle (best-effort; don't fail pipeline on error)
  try {
    const site = getJobSiteFromUrl(job.job_url);
    const jobIdFromUrl = getJobIdFromUrl(job.job_url);
    if (site && jobIdFromUrl) {
      await setJobLifecycleStatus(job.user_id, toJobRef(site, jobIdFromUrl), 'in_progress');
    }
  } catch { /* ignore */ }

  try {
    const automationLevel =
      job.automation_level === 'full' || job.automation_level === 'review' ? job.automation_level : 'review';
    const result = await pipelineFn(job.job_url, {
      userId: job.user_id,
      submit: job.submit,
      forceScrape: job.force_scrape,
      jobId,
      automationLevel,
      onPhaseChange: (phase) => void updatePipelineJobPhase(jobId, phase),
      checkCancelled: async () => {
        const j = await getPipelineJobById(jobId);
        return j?.status === 'cancelled';
      },
    });
    if (result.paused === true) {
      return;
    }
    const current = await getPipelineJobById(jobId);
    if (current?.status === 'cancelled') return;
    await updatePipelineJobStatus(jobId, 'done', result);
    // Mark submitted lifecycle when application was sent
    if (result.outcome === 'submitted') {
      try {
        const site = getJobSiteFromUrl(job.job_url);
        const jobIdFromUrl = getJobIdFromUrl(job.job_url);
        if (site && jobIdFromUrl) {
          await setJobLifecycleStatus(job.user_id, toJobRef(site, jobIdFromUrl), 'submitted');
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    if (err === JOB_CANCELLED_ERROR || (err instanceof Error && err.message === 'JOB_CANCELLED')) {
      await updatePipelineJobStatus(jobId, 'cancelled');
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const code = isAppError(err) ? err.code : null;
    await updatePipelineJobStatus(jobId, 'failed', undefined, message, code);
  }
}

/**
 * Run only the apply step for a job that is awaiting_approval. Call after user approves.
 */
export async function resumePipelineAfterApproval(jobId: string): Promise<void> {
  const job = await getPipelineJobById(jobId);
  if (!job || job.status !== 'awaiting_approval') return;

  const userId = job.user_id;
  const jobUrl = job.job_url;
  const site = getJobSiteFromUrl(jobUrl);
  const jobIdFromUrl = getJobIdFromUrl(jobUrl);
  if (!site || !jobIdFromUrl) {
    await updatePipelineJobStatus(jobId, 'failed', undefined, 'Invalid job URL');
    return;
  }

  await updatePipelineJobPhase(jobId, 'Applying...');
  await updatePipelineJobStatus(jobId, 'running');

  try {
    const jobRecord = await getJob(site, jobIdFromUrl);
    const rawRequired =
      typeof job.artifacts === 'object' && job.artifacts !== null && 'requiredSections' in (job.artifacts as object)
        ? (job.artifacts as Record<string, unknown>).requiredSections
        : undefined;
    const requiredSections = Array.isArray(rawRequired) ? (rawRequired as string[]) : ['resume', 'coverLetter'];

    const needCover = requiredSections.includes('coverLetter');
    const needTranscript = requiredSections.includes('transcript');

    if (needTranscript) {
      const path = await getTranscriptPath(userId);
      if (!existsSync(path)) {
        await updatePipelineJobStatus(
          jobId,
          'failed',
          undefined,
          'This job requires a transcript. Upload one in the app (Settings or chat) or set TRANSCRIPT_PATH in .env, then try again.'
        );
        return;
      }
    }

    const [resumeJson, coverLetterContent] = await Promise.all([
      getResumeForJob(userId, site, jobIdFromUrl),
      needCover ? getCoverLetterForJob(userId, site, jobIdFromUrl) : Promise.resolve(null),
    ]);
    const { resumePath } = await ensureResumePdfFromDb(userId, site, jobIdFromUrl, {
      profile: undefined,
      job: jobRecord ?? undefined,
    });
    let coverPath: string | undefined;
    if (needCover) {
      const out = await ensureCoverLetterPdfFromDb(userId, site, jobIdFromUrl, {
        profile: undefined,
        job: jobRecord ?? undefined,
      });
      coverPath = out.coverPath;
    }
    const transcriptPath = needTranscript ? await getTranscriptPath(userId) : undefined;
    await updatePipelineJobSubmit(jobId, true);

    let outcome: string;
    if (site === 'greenhouse') {
      const { runGreenhouseApply } = await import('../greenhouse/apply.js');
      const ghResult = await runGreenhouseApply(jobUrl, {
        submit: true,
        resumePath: resumePath ?? undefined,
        coverPath,
        userId,
      });
      outcome = ghResult.applied ? 'submitted' : 'skipped';
    } else {
      const applyResult = await runHandshakeApply(jobUrl, {
        resumePath: resumePath ?? undefined,
        coverPath,
        transcriptPath,
        submit: true,
        userId,
      });
      outcome = applyResult.skipped ? 'already_applied' : applyResult.applied ? 'submitted' : 'skipped';
    }
    const result = {
      job: jobRecord ?? { title: (job.artifacts as Record<string, unknown>)?.jobTitle },
      outcome,
      appliedArtifacts: {
        resume: resumeJson ?? null,
        coverLetter: coverLetterContent ? { text: coverLetterContent.text } : null,
      },
    };
    await updatePipelineJobStatus(jobId, 'done', result);
    if (outcome === 'submitted') {
      try {
        await setJobLifecycleStatus(userId, toJobRef(site, jobIdFromUrl), 'submitted');
      } catch { /* ignore */ }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = isAppError(err) ? err.code : null;
    await updatePipelineJobStatus(jobId, 'failed', undefined, message, code);
  }
}
