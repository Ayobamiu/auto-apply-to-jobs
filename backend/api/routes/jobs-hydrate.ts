/**
 * POST /jobs/hydrate — trigger hydration for a greenhouse job.
 * Fetches full content + form questions from Greenhouse API, updates DB,
 * classifies form fields, generates answers, and stores in application_forms.
 * The goal: everything is ready before the user clicks "Apply".
 */
import type { Request, Response } from 'express';
import { hydrateGreenhouseJob } from '../../greenhouse/hydrate.js';
import { getJob } from '../../data/jobs.js';
import { classifyAllFields } from '../../shared/form-extraction/field-classifier.js';
import { generateAnswers } from '../../shared/form-extraction/answer-generator.js';
import {
  getApplicationForm,
  upsertApplicationForm,
  getAllSavedAnswers,
  getExtendedProfile,
} from '../../data/application-forms.js';
import { getProfile } from '../../data/profile.js';
import type { ApplicationFormRecord, NormalizedFormSchema } from '../../shared/types.js';

export async function postJobsHydrate(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobRef } = req.body ?? {};
  if (typeof jobRef !== 'string' || !jobRef.includes(':')) {
    res.status(400).json({ error: 'jobRef is required (e.g. greenhouse:12345)' });
    return;
  }

  const i = jobRef.indexOf(':');
  const site = jobRef.slice(0, i);
  const jobId = jobRef.slice(i + 1);

  if (site !== 'greenhouse') {
    res.status(400).json({ error: 'Hydration is only supported for greenhouse jobs' });
    return;
  }

  try {
    const result = await hydrateGreenhouseJob(jobId);
    const job = await getJob('greenhouse', jobId);

    const responseJob = job ? { ...job, jobId, site: 'greenhouse' } : null;

    res.status(200).json({
      hydrated: !result.alreadyHydrated,
      job: responseJob,
      formFieldCount: result.formFields.length,
    });

    if (result.formFields.length > 0 && !result.alreadyHydrated) {
      setImmediate(async () => {
        try {
          const existing = await getApplicationForm(userId, jobRef);
          if (existing && existing.classifiedFields.length > 0) return;

          const schema: NormalizedFormSchema = {
            jobRef,
            site: 'greenhouse',
            extractedAt: new Date().toISOString(),
            fields: result.formFields,
          };

          const classifiedFields = await classifyAllFields(result.formFields);

          const [profile, extendedProfile, savedAnswers] = await Promise.all([
            getProfile(userId),
            getExtendedProfile(userId),
            getAllSavedAnswers(userId),
          ]);

          const answers = await generateAnswers({
            classifiedFields,
            profile,
            extendedProfile,
            savedAnswers,
            job: job ?? undefined,
          });

          const formRecord: ApplicationFormRecord = {
            userId,
            jobRef,
            site: 'greenhouse',
            schema,
            classifiedFields,
            answers,
            status: 'draft',
          };

          await upsertApplicationForm(formRecord);
          console.log(`[hydrate] Pre-extracted ${classifiedFields.length} fields, ${answers.length} answers for ${jobRef}`);
        } catch (err) {
          console.warn('[hydrate] Background form extraction failed:', (err as Error).message);
        }
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Hydration failed';
    res.status(500).json({ error: message });
  }
}
