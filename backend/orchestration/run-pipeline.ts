/**
 * Pipeline: get job (from URL scrape/cache or file), generate resume, then run Handshake apply when JOB_URL provided.
 */
import 'dotenv/config';
import { runResumeGenerator } from '../agents/resume_generator_agent/index.js';
import { ensureResumePdfFromDb } from '../agents/resume_generator_agent/export-pdf.js';
import { runJobScraper } from '../agents/job_scraper_agent/index.js';
import { loadJob } from '../shared/job.js';
import { toHandshakeJobDetailsUrl, getJobIdFromUrl, getJobSiteFromUrl } from '../shared/job-from-url.js';
import { updateJob } from '../data/jobs.js';
import { resolveUserId, getTranscriptPath } from '../shared/config.js';
import { existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { isAppError } from '../shared/errors.js';
import { preflightForPipeline } from '../shared/preflight.js';
import { probeRequiredSections } from '../shared/probe-apply-modal.js';
import { generateCoverLetter } from '../agents/resume_generator_agent/cover-letter.js';
import { generateWrittenDocument } from '../agents/resume_generator_agent/written-document.js';
import { runHandshakeApply } from '../agents/auto_apply_agent/handshake-apply-real.js';
import { getApplicationStatus } from '../agents/job_scraper_agent/index.js';
import { startPhase, startTotal, isTimingEnabled } from '../shared/timing.js';
import { setPipelineJobAwaitingApproval } from '../data/pipeline-jobs.js';
import { getResumeForJob, getCoverLetterForJob, getWrittenDocumentForJob, getWrittenDocumentForJobArtifact } from '../data/job-artifacts.js';
import { getApplicationForm } from '../data/application-forms.js';
import type { Job, PipelineApplyOutcome, RunPipelineForJobOptions, RunPipelineForJobResult, SectionKey } from '../shared/types.js';
import { SUPPORTED_SECTION_KEYS } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Thrown when pipeline is cancelled via checkCancelled. */
export const JOB_CANCELLED_ERROR = new Error('JOB_CANCELLED');

const UNSUPPORTED_SECTIONS_MESSAGE =
  "This job requires document types we don't support. We only support resume, transcript, and cover letter.";

async function throwIfCancelled(checkCancelled: (() => Promise<boolean>) | undefined): Promise<void> {
  if (checkCancelled && (await checkCancelled())) throw JOB_CANCELLED_ERROR;
}

function getJobUrl(): string | null {
  let argv = process.argv.slice(2);
  const userIdx = argv.indexOf('--user');
  if (userIdx !== -1 && argv[userIdx + 1]) {
    argv = argv.slice(0, userIdx).concat(argv.slice(userIdx + 2));
  }
  const raw = process.env.JOB_URL || argv[0] || null;
  return raw ? toHandshakeJobDetailsUrl(raw as string) : null;
}

export type { RunPipelineForJobOptions, RunPipelineForJobResult } from '../shared/types.js';

export async function runPipelineForJob(
  jobUrl: string | null,
  options: RunPipelineForJobOptions = {}
): Promise<RunPipelineForJobResult> {
  const userId = options.userId ?? resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  await throwIfCancelled(options.checkCancelled);
  if (isTimingEnabled()) console.log('[timing] Phase breakdown:');
  const endTotal = startTotal('pipeline');
  const endPreflight = startPhase('Preflight');
  await preflightForPipeline(jobUrl ?? undefined, userId);
  endPreflight();
  await throwIfCancelled(options.checkCancelled);

  const onPhase = options.onPhaseChange;
  let job: Job;
  if (jobUrl) {
    onPhase?.('Scraping job...');
    console.log('Step 0: Get job from URL (scrape or cache)...');
    const endStep0 = startPhase('Step 0: Get job (scrape or cache)');
    const { job: scrapedJob } = await runJobScraper(jobUrl, {
      forceScrape: options.forceScrape,
      userId,
    });
    job = scrapedJob;
    endStep0();
    await throwIfCancelled(options.checkCancelled);
    console.log('Job:', job.title || job.company || jobUrl);
  } else {
    const endLoad = startPhase('Load job from file');
    job = loadJob();
    endLoad();
  }

  if (jobUrl) {
    const site = getJobSiteFromUrl(jobUrl);
    const jobId = getJobIdFromUrl(jobUrl) ?? undefined;
    if (site && jobId) {
      await updateJob(site, jobId, { ...job });
    }
  }

  if (!jobUrl) {
    console.log('No JOB_URL. Run handshake:apply with the job URL when ready.');
    endTotal();
    return { job, resumePath: undefined, outcome: 'no_apply' };
  }

  const endAlreadyApplied = startPhase('Check already applied (store)');
  const { applicationSubmitted } = await getApplicationStatus(jobUrl, { fromStoreOnly: true, userId });
  endAlreadyApplied();
  if (applicationSubmitted) {
    console.log('Already applied to this job. Skipping apply step.');
    endTotal();
    return { job, resumePath: undefined, outcome: 'already_applied' };
  }

  const jobHasExternalApplicationOnHandshake = getJobSiteFromUrl(jobUrl) === 'handshake' && job.applyType === 'apply_externally';


  const siteFromUrl = getJobSiteFromUrl(jobUrl);
  const jobIdFromUrl = getJobIdFromUrl(jobUrl);

  // Artifact reuse: if we already have resume (and cover when required), skip generation and go straight to awaiting_approval
  // skipp this for handshake:apply_externally
  if (siteFromUrl && jobIdFromUrl && options.jobId && !jobHasExternalApplicationOnHandshake) {
    onPhase?.('Checking required documents...');
    try {
      const probeResult = await probeRequiredSections(jobUrl, userId);
      const requiredSectionsForReuse = probeResult.requiredSections;
      const unsupported = requiredSectionsForReuse.filter((k) => !SUPPORTED_SECTION_KEYS.includes(k as SectionKey));
      if (unsupported.length > 0) {
        throw new Error(UNSUPPORTED_SECTIONS_MESSAGE);
      }
      await throwIfCancelled(options.checkCancelled);
      const existingResume = await getResumeForJob(userId, siteFromUrl, jobIdFromUrl);
      const needCover = requiredSectionsForReuse.includes('coverLetter');
      const existingCover = needCover ? await getCoverLetterForJob(userId, siteFromUrl, jobIdFromUrl) : { text: '' };
      if (existingResume && (!needCover || (existingCover && existingCover.text))) {
        console.log('Resume and cover (if required) already exist for this job. Skipping generation.');
        await setPipelineJobAwaitingApproval(options.jobId, {
          jobTitle: job.title,
          jobUrl: jobUrl,
          requiredSections: requiredSectionsForReuse,
        });
        endTotal();
        return { job, resumePath: undefined, outcome: 'no_apply', paused: true };
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === UNSUPPORTED_SECTIONS_MESSAGE) throw err;
      console.warn('Probe failed or missing artifacts, running full pipeline:', msg);
    }
  }

  onPhase?.('Generating resume...');
  console.log('Step 1: Generate resume from profile + job...');
  const endStep1 = startPhase('Step 1: Generate resume');
  const { jobRef, resumePath: generatedPdfPath } = await runResumeGenerator({ job, userId });
  let resumePath = generatedPdfPath;
  const site = job?.site;
  const jobId = job?.jobId;
  if (!resumePath && jobRef && site && jobId) {
    const endPdf = startPhase('Step 1b: Ensure PDF from DB');
    const { resumePath: ensured } = await ensureResumePdfFromDb(userId, site, jobId, { profile: undefined, job });
    resumePath = ensured;
    endPdf();
  }
  endStep1();
  console.log('Resume:', resumePath ?? jobRef ?? '(none)');

  onPhase?.('Checking required documents...');
  let coverPath = options.coverPath;
  let requiredSections: string[] = ['resume', 'coverLetter'];
  //skip this for handshake:apply_externally
  if (!jobHasExternalApplicationOnHandshake) {
    console.log('Step 2: Probe required attachment sections...');
    const endProbe = startPhase('Step 2: Probe apply modal');
    try {
      const probeResult = await probeRequiredSections(jobUrl, userId);
      requiredSections = probeResult.requiredSections;
      const unsupported = requiredSections.filter((k) => !SUPPORTED_SECTION_KEYS.includes(k as SectionKey));
      if (unsupported.length > 0) {
        throw new Error(
          "This job requires document types we don't support. We only support resume, transcript, and cover letter."
        );
      }
      await throwIfCancelled(options.checkCancelled);
      if (requiredSections.includes('coverLetter') && !coverPath) {
        console.log('Cover letter required — generating...');
        const endCover = startPhase('Step 2b: Generate cover letter');
        const { coverPath: generated } = await generateCoverLetter({ job, userId });
        coverPath = generated;
        endCover();
        await throwIfCancelled(options.checkCancelled);
        console.log('Cover letter:', coverPath);
      }

      // Generate written document(s) if the form has upload_other_document fields with instructions
      if (siteFromUrl && jobIdFromUrl) {
        const { toJobRef: buildJobRef } = await import('../data/user-job-state.js');
        const jRef = buildJobRef(siteFromUrl, jobIdFromUrl);
        if (jRef) {
          const formData = await getApplicationForm(userId, jRef);
          if (formData) {
            const writtenDocFields = formData.classifiedFields.filter(
              (f) => f.intent === 'upload_other_document' && f.rawInstructions,
            );
            if (writtenDocFields.length > 0) {
              console.log(
                `[pipeline] Found ${writtenDocFields.length} written-document field(s); generating per field...`,
              );
              for (const f of writtenDocFields) {
                if (!f.rawInstructions) continue;
                const existingForField = await getWrittenDocumentForJobArtifact(
                  userId,
                  siteFromUrl,
                  jobIdFromUrl,
                  f.id,
                );
                console.log({ existingForField });
                if (existingForField && !options.forceRegenerate) {
                  continue;
                }
                const endWrittenDoc = startPhase(`Step 2c: Generate written document (${f.id})`);
                try {
                  await generateWrittenDocument({
                    job,
                    userId,
                    instructions: f.rawInstructions,
                    artifactId: f.id,
                  });
                } catch (err) {
                  console.warn(
                    'Written document generation failed for field',
                    f.id,
                    '(non-fatal):',
                    (err as Error).message,
                  );
                }
                endWrittenDoc();
                await throwIfCancelled(options.checkCancelled);
              }
            }
          }
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === UNSUPPORTED_SECTIONS_MESSAGE) throw err;
      console.warn('Probe failed, proceeding without pre-check:', msg);
    }
    endProbe();
  }
  const automationLevel = options.automationLevel ?? 'review';
  if (automationLevel === 'review' && options.jobId) {
    let hasDynamicForm = false;
    let hasWrittenDocument = false;
    if (siteFromUrl && jobIdFromUrl) {
      const { toJobRef } = await import('../data/user-job-state.js');
      const jobRefStr = toJobRef(siteFromUrl, jobIdFromUrl);
      if (jobRefStr) {
        const formData = await getApplicationForm(userId, jobRefStr);
        if (formData && formData.classifiedFields.some((f) => f.fieldType !== 'file_upload')) {
          hasDynamicForm = true;
        }
      }
      const writtenDoc = await getWrittenDocumentForJob(userId, siteFromUrl, jobIdFromUrl);
      if (writtenDoc) {
        hasWrittenDocument = true;
      }
    }

    await setPipelineJobAwaitingApproval(options.jobId, {
      jobTitle: job.title,
      jobUrl: jobUrl,
      requiredSections,
      hasDynamicForm,
      hasWrittenDocument,
    });
    endTotal();
    return {
      job,
      resumePath: resumePath ?? undefined,
      outcome: jobHasExternalApplicationOnHandshake ? 'handshake_apply_externally_not_supported' : 'no_apply',
      // dont pause for handshake:apply_externally
      paused: !jobHasExternalApplicationOnHandshake,
    };
  }

  if (jobHasExternalApplicationOnHandshake) {
    endTotal();
    return { job, resumePath: resumePath || undefined, outcome: 'handshake_apply_externally_not_supported' };
  }

  onPhase?.('Applying to job...');
  let transcriptPath: string | undefined;
  if (requiredSections.includes('transcript')) {
    const path = await getTranscriptPath(userId);
    if (!existsSync(path)) {
      throw new Error(
        'This job requires a transcript. Upload one in the app (Settings or chat) or set TRANSCRIPT_PATH in .env, then try again.'
      );
    }
    transcriptPath = path;
  }
  console.log('Step 3: Run Handshake apply...');
  const endApply = startPhase('Step 3: Handshake apply (browser + upload + submit)');
  const applyResult = await runHandshakeApply(jobUrl, {
    submit: options.submit ?? (process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true'),
    resumePath: resumePath ?? undefined,
    coverPath,
    transcriptPath,
    userId,
  });
  endApply();
  endTotal();
  const outcome: PipelineApplyOutcome =
    applyResult.skipped ? 'already_applied' : applyResult.applied ? 'submitted' : 'skipped';
  return {
    job,
    resumePath: resumePath ?? undefined,
    outcome,
  };
}

async function main(): Promise<void> {
  const jobUrl = getJobUrl();
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  await runPipelineForJob(jobUrl, {
    submit: process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true',
    forceScrape: process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true',
    userId,
  });
}

const entryHref = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryHref === import.meta.url) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      if (isAppError(err)) {
        console.error(err.message);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
}
