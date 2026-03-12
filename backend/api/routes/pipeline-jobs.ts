/**
 * GET /pipeline/jobs/:jobId — check status of a pipeline run (auth required).
 * GET /pipeline/jobs — list recent pipeline jobs for the current user (auth required).
 * GET/PUT /pipeline/jobs/:jobId/artifacts, .../artifacts/resume, .../artifacts/cover.
 * POST /pipeline/jobs/:jobId/approve — resume apply step when awaiting_approval (idempotent).
 */
import type { Request, Response } from 'express';
import { createReadStream, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { getPipelineJob, listPipelineJobs, cancelPipelineJob, type PipelineJob } from '../../data/pipeline-jobs.js';
import { normalizePipelineOutcome, getPipelineOutcomeMessage } from '../../shared/pipeline-outcome.js';
import { isNonRetryableFailureCode } from '../../shared/errors.js';
import { getJobIdFromUrl, getJobSiteFromUrl } from '../../shared/job-from-url.js';
import {
  getResumeForJob,
  saveResumeForJob,
  getCoverLetterForJob,
  saveCoverLetterForJob,
  getEditHistory,
  appendEditHistory,
} from '../../data/job-artifacts.js';
import { toJobRef } from '../../data/user-job-state.js';
import { getJob } from '../../data/jobs.js';
import { resumePipelineAfterApproval } from '../../orchestration/run-pipeline-background.js';
import { ensureResumePdfFromDb, exportResumeToPdf } from '../../agents/resume_generator_agent/export-pdf.js';
import { ensureCoverLetterPdfFromDb, generateCoverLetterPdfFromText } from '../../agents/resume_generator_agent/cover-letter.js';

export async function getPipelineJobStatus(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobId = req.params.jobId as string;
  const job = await getPipelineJob(jobId, userId);
  if (!job) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  let userMessage: string | null = null;
  if (job.status === 'done' && job.result && typeof job.result === 'object') {
    const result = job.result as Record<string, unknown>;
    const outcome = normalizePipelineOutcome(result);
    const jobTitle = String((result.job as Record<string, unknown>)?.title ?? job.job_url ?? '');
    userMessage = outcome ? getPipelineOutcomeMessage(outcome, jobTitle) : null;
  }
  res.status(200).json({
    status: job.status,
    phase: job.phase ?? null,
    jobUrl: job.job_url,
    submit: job.submit,
    result: job.result,
    error: job.error,
    error_code: job.error_code ?? null,
    retryAllowed: !isNonRetryableFailureCode(job.error_code ?? null),
    userMessage,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
}

/** POST /pipeline/jobs/:jobId/cancel — cancel a pending or running job (auth required). */
export async function postPipelineJobCancel(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobId = req.params.jobId as string;
  const cancelled = await cancelPipelineJob(jobId, userId);
  if (cancelled) {
    res.status(200).json({ cancelled: true });
    return;
  }
  res.status(400).json({ error: 'Job not found or cannot be cancelled.' });
}

export async function getPipelineJobList(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobs = await listPipelineJobs(userId);
  res.status(200).json(
    jobs.map((j) => ({
      id: j.id,
      status: j.status,
      phase: j.phase ?? null,
      jobUrl: j.job_url,
      submit: j.submit,
      result: j.result,
      error: j.error,
      error_code: j.error_code ?? null,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    }))
  );
}

async function getPipelineJobAndSiteJobId(
  req: Request,
  res: Response
): Promise<{ job: PipelineJob; site: string; jobIdFromUrl: string } | null> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const jobId = req.params.jobId as string;
  const job = await getPipelineJob(jobId, userId);
  if (!job) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const site = getJobSiteFromUrl(job.job_url);
  const jobIdFromUrl = getJobIdFromUrl(job.job_url);
  if (!site || !jobIdFromUrl) {
    res.status(400).json({ error: 'Invalid job URL on pipeline job' });
    return null;
  }
  return { job, site, jobIdFromUrl };
}

/** GET /pipeline/jobs/:jobId/artifacts — resume JSON, cover text, job title (when status is awaiting_approval). */
export async function getPipelineJobArtifacts(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job, site, jobIdFromUrl } = ctx;

  const userId = req.userId!;
  const [resume, cover, jobRecord] = await Promise.all([
    getResumeForJob(userId, site, jobIdFromUrl),
    getCoverLetterForJob(userId, site, jobIdFromUrl),
    getJob(site, jobIdFromUrl),
  ]);
  const jobTitle =
    jobRecord?.title ??
    (typeof job.artifacts === 'object' && job.artifacts !== null && 'jobTitle' in job.artifacts
      ? String((job.artifacts as Record<string, unknown>).jobTitle)
      : job.job_url);
  const rawRequired = typeof job.artifacts === 'object' && job.artifacts !== null && 'requiredSections' in job.artifacts
    ? (job.artifacts as Record<string, unknown>).requiredSections
    : undefined;
  const requiredSections = Array.isArray(rawRequired) ? (rawRequired as string[]) : ['resume', 'coverLetter'];
  res.status(200).json({
    resume: resume ?? null,
    cover: cover ? { text: cover.text } : null,
    jobTitle,
    requiredSections,
  });
}

/** GET /pipeline/jobs/:jobId/artifacts/resume — JSON or ?format=pdf for PDF stream. */
export async function getPipelineJobArtifactsResume(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job, site, jobIdFromUrl } = ctx;
  if (job.status !== 'awaiting_approval') {
    res.status(400).json({ error: 'Job is not awaiting approval' });
    return;
  }
  const userId = req.userId!;
  const format = req.query.format === 'pdf';
  if (format) {
    const jobRecord = await getJob(site, jobIdFromUrl);
    const { resumePath } = await ensureResumePdfFromDb(userId, site, jobIdFromUrl, {
      profile: undefined,
      job: jobRecord ?? undefined,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    createReadStream(resumePath).pipe(res);
    return;
  }
  const resume = await getResumeForJob(userId, site, jobIdFromUrl);
  if (!resume) {
    res.status(404).json({ error: 'No resume for this job' });
    return;
  }
  res.status(200).json(resume);
}

/** GET /pipeline/jobs/:jobId/artifacts/cover — text or ?format=pdf for PDF stream. */
export async function getPipelineJobArtifactsCover(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job, site, jobIdFromUrl } = ctx;
  if (job.status !== 'awaiting_approval') {
    res.status(400).json({ error: 'Job is not awaiting approval' });
    return;
  }
  const userId = req.userId!;
  const format = req.query.format === 'pdf';
  if (format) {
    const jobRecord = await getJob(site, jobIdFromUrl);
    const { coverPath } = await ensureCoverLetterPdfFromDb(userId, site, jobIdFromUrl, {
      profile: undefined,
      job: jobRecord ?? undefined,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.pdf"');
    createReadStream(coverPath).pipe(res);
    return;
  }
  const cover = await getCoverLetterForJob(userId, site, jobIdFromUrl);
  if (!cover) {
    res.status(404).json({ error: 'No cover letter for this job' });
    return;
  }
  res.status(200).json({ text: cover.text });
}

/** PUT /pipeline/jobs/:jobId/artifacts/resume — update resume JSON. */
export async function putPipelineJobArtifactsResume(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job, site, jobIdFromUrl } = ctx;
  if (job.status !== 'awaiting_approval') {
    res.status(400).json({ error: 'Job is not awaiting approval' });
    return;
  }
  const userId = req.userId!;
  const json = req.body;
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    res.status(400).json({ error: 'Body must be a resume JSON object' });
    return;
  }
  try {
    await saveResumeForJob(userId, site, jobIdFromUrl, json as Record<string, unknown>);
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save resume';
    res.status(400).json({ error: message });
  }
}

/** PUT /pipeline/jobs/:jobId/artifacts/cover — update cover letter text. */
export async function putPipelineJobArtifactsCover(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job, site, jobIdFromUrl } = ctx;
  if (job.status !== 'awaiting_approval') {
    res.status(400).json({ error: 'Job is not awaiting approval' });
    return;
  }
  const userId = req.userId!;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'Body must include text (non-empty string)' });
    return;
  }
  try {
    await saveCoverLetterForJob(userId, site, jobIdFromUrl, { text });
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save cover letter';
    res.status(400).json({ error: message });
  }
}

/** POST /pipeline/jobs/:jobId/approve — idempotent; only run apply when status is awaiting_approval. */
export async function postPipelineJobApprove(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobId = req.params.jobId as string;
  const job = await getPipelineJob(jobId, userId);
  if (!job) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (job.status !== 'awaiting_approval') {
    res.status(409).json({ error: 'Already approved or job not awaiting approval', status: job.status });
    return;
  }
  setImmediate(() => void resumePipelineAfterApproval(jobId));
  res.status(202).json({ message: 'Approved; applying now.' });
}

/** GET /pipeline/jobs/:jobId/applied-artifacts/resume — JSON or ?format=pdf for PDF from snapshot (when status is done). */
export async function getAppliedArtifactsResume(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job } = ctx;
  if (job.status !== 'done' || !job.result || typeof job.result !== 'object') {
    res.status(404).json({ error: 'No applied artifacts for this job' });
    return;
  }
  const result = job.result as Record<string, unknown>;
  const applied = result.appliedArtifacts as { resume?: Record<string, unknown> } | undefined;
  if (!applied?.resume) {
    res.status(404).json({ error: 'No applied resume for this job' });
    return;
  }
  const format = req.query.format === 'pdf';
  if (format) {
    const uid = randomUUID();
    const tempDir = tmpdir();
    const base = `applied-resume-${uid}`;
    try {
      const { resumePath, jsonPath } = exportResumeToPdf(applied.resume as Record<string, unknown>, {
        outputDir: tempDir,
        resumeBasename: base,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
      const stream = createReadStream(resumePath);
      stream.pipe(res);
      stream.on('end', () => {
        try {
          unlinkSync(resumePath);
          unlinkSync(jsonPath);
        } catch (_) { }
      });
      stream.on('error', () => {
        try {
          unlinkSync(resumePath);
          unlinkSync(jsonPath);
        } catch (_) { }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate PDF';
      res.status(500).json({ error: message });
    }
    return;
  }
  res.status(200).json(applied.resume);
}

/** GET /pipeline/jobs/:jobId/applied-artifacts/cover — JSON or ?format=pdf for PDF from snapshot (when status is done). */
export async function getAppliedArtifactsCover(req: Request, res: Response): Promise<void> {
  const ctx = await getPipelineJobAndSiteJobId(req, res);
  if (!ctx) return;
  const { job } = ctx;
  if (job.status !== 'done' || !job.result || typeof job.result !== 'object') {
    res.status(404).json({ error: 'No applied artifacts for this job' });
    return;
  }
  const result = job.result as Record<string, unknown>;
  const applied = result.appliedArtifacts as { coverLetter?: { text: string } } | undefined;
  if (!applied?.coverLetter?.text) {
    res.status(404).json({ error: 'No applied cover letter for this job' });
    return;
  }
  const format = req.query.format === 'pdf';
  if (format) {
    const uid = randomUUID();
    const tempDir = tmpdir();
    const pdfPath = join(tempDir, `applied-cover-${uid}.pdf`);
    try {
      await generateCoverLetterPdfFromText(applied.coverLetter.text, pdfPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.pdf"');
      const stream = createReadStream(pdfPath);
      stream.pipe(res);
      stream.on('end', () => {
        try {
          unlinkSync(pdfPath);
        } catch (_) { }
      });
      stream.on('error', () => {
        try {
          unlinkSync(pdfPath);
        } catch (_) { }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate PDF';
      res.status(500).json({ error: message });
    }
    return;
  }
  res.status(200).json({ text: applied.coverLetter.text });
}

export async function getArtifactEditHistory(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { jobId, type } = req.params as { jobId: string; type: string };
  const artifactType = type === 'cover' ? 'cover_letter' : 'resume';
  const job = await getPipelineJob(jobId, userId);
  if (!job) { res.status(404).json({ error: 'Not found' }); return; }
  const site = getJobSiteFromUrl(job.job_url);
  const jid = getJobIdFromUrl(job.job_url);
  if (!site || !jid) { res.status(404).json({ error: 'Not found' }); return; }
  const jobRef = toJobRef(site, jid);
  if (!jobRef) { res.status(404).json({ error: 'Not found' }); return; }
  const history = await getEditHistory(userId, jobRef, artifactType as any);
  res.status(200).json(history);
}

export async function postArtifactEditHistory(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { jobId, type } = req.params as { jobId: string; type: string };
  const { entry } = req.body as { entry?: string };
  if (!entry || typeof entry !== 'string') { res.status(400).json({ error: 'Missing entry' }); return; }
  const artifactType = type === 'cover' ? 'cover_letter' : 'resume';
  const job = await getPipelineJob(jobId, userId);
  if (!job) { res.status(404).json({ error: 'Not found' }); return; }
  const site = getJobSiteFromUrl(job.job_url);
  const jid = getJobIdFromUrl(job.job_url);
  if (!site || !jid) { res.status(404).json({ error: 'Not found' }); return; }
  const jobRef = toJobRef(site, jid);
  if (!jobRef) { res.status(404).json({ error: 'Not found' }); return; }
  await appendEditHistory(userId, jobRef, artifactType as any, entry);
  res.status(200).json({ ok: true });
}
