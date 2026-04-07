/**
 * Greenhouse apply agent: opens the form in Playwright, fills fields, uploads files, submits.
 * Plugs into the unified pipeline as the greenhouse counterpart to runHandshakeApply.
 */
import { chromium } from 'playwright';
import { GreenhouseSiteFormExtractor, extractGreenhouseForm } from './extractor.js';
import { classifyAllFields } from '../shared/form-extraction/field-classifier.js';
import { generateAnswers } from '../shared/form-extraction/answer-generator.js';
import {
  getApplicationForm,
  upsertApplicationForm,
  getAllSavedAnswers,
  getExtendedProfile,
  updateApplicationFormStatus,
} from '../data/application-forms.js';
import { getProfile } from '../data/profile.js';
import { getJob, updateJob } from '../data/jobs.js';
import { getJobIdFromUrl, getJobSiteFromUrl } from '../shared/job-from-url.js';
import { setUserJobState, toJobRef } from '../data/user-job-state.js';

interface GreenhouseApplyOptions {
  submit: boolean;
  resumePath?: string;
  coverPath?: string;
  userId: string;
}

interface GreenhouseApplyResult {
  applied: boolean;
  skipped: boolean;
  error?: string;
}

export async function runGreenhouseApply(
  jobUrl: string,
  options: GreenhouseApplyOptions,
): Promise<GreenhouseApplyResult> {
  const { submit, resumePath, coverPath, userId } = options;
  const site = getJobSiteFromUrl(jobUrl);
  const jobId = getJobIdFromUrl(jobUrl);

  if (!jobId) {
    return { applied: false, skipped: true, error: 'Could not parse job ID from URL' };
  }

  const jobRef = toJobRef(site, jobId);
  const job = await getJob(site, jobId) ?? undefined;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`[greenhouse/apply] Navigating to ${jobUrl}...`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2_000);

    let formData = await getApplicationForm(userId, jobRef);

    if (!formData || formData.classifiedFields.length === 0) {
      console.log('[greenhouse/apply] No pre-extracted form, extracting now...');
      const extractResult = await extractGreenhouseForm(page, jobRef);
      const classifiedFields = await classifyAllFields(extractResult.schema.fields);

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
        job,
      });

      formData = {
        userId,
        jobRef,
        site,
        schema: extractResult.schema,
        classifiedFields,
        answers,
        status: 'draft',
      };
      await upsertApplicationForm(formData);
    }

    const filePaths: Record<string, string> = {};
    if (resumePath) filePaths.resume = resumePath;
    if (coverPath) filePaths.coverLetter = coverPath;

    const fileFields = formData.schema.fields.filter((f) => f.fieldType === 'file_upload');
    if (fileFields.length > 0 && Object.keys(filePaths).length > 0) {
      console.log('[greenhouse/apply] Uploading files...');
      const uploadResults = await GreenhouseSiteFormExtractor.fillFileUpload(
        page,
        fileFields,
        filePaths,
      );
      for (const r of uploadResults) {
        console.log(`  [upload] ${r.fieldId}: ${r.success ? 'OK' : r.error}`);
      }
    }

    console.log('[greenhouse/apply] Filling form fields...');
    // filter classifiedFields to only include fields that are not file_upload

    const fillClassifiedFields = formData.classifiedFields.filter((f) => f.fieldType !== 'file_upload');
    const fillResults = await GreenhouseSiteFormExtractor.fillForm(
      page,
      null,
      fillClassifiedFields,
      formData.answers,
    );
    const successCount = fillResults.filter((r) => r.success).length;
    console.log(`[greenhouse/apply] Filled ${successCount}/${fillResults.length} fields`);

    if (submit) {
      console.log('[greenhouse/apply] Submitting form...');
      const submitBtn = page.locator('button[type="submit"], input[type="submit"], #submit_app');
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(3_000);

        const body = await page.content();
        const hasConfirmation =
          body.includes('Thank you') ||
          body.includes('Application Received') ||
          body.includes('application has been submitted') ||
          body.includes('has been received') ||
          await page.locator('.confirmation, .thank-you, [class*="success"], [class*="confirmation"]').count() > 0;

        if (hasConfirmation) {
          console.log('[greenhouse/apply] Application submitted successfully');
          await upsertApplicationForm({ ...formData, status: 'submitted' });
          const submittedAt = new Date().toISOString();
          await setUserJobState(userId, jobRef, { applicationSubmitted: true, appliedAt: submittedAt });
          const stored = await getJob(site, jobId);
          await updateJob(site, jobId, { ...(stored || { url: jobUrl }) });
          // Mark dynamic form as submitted
          if (jobRef) {
            await updateApplicationFormStatus(userId, jobRef, 'submitted').catch(() => { });
          }
          return { applied: true, skipped: false };
        }
        //TODO: Implement email verification
        // Some Greenhouse boards require email verification after submit
        const hasVerification = body.includes('verification code') || body.includes('verify your email');
        if (hasVerification) {
          console.log('[greenhouse/apply] Submission requires email verification (form was filled and submit clicked)');
          await upsertApplicationForm({ ...formData, status: 'submitted' });
          return { applied: true, skipped: false };
        }

        const errorVisible = await page.locator('.error, [class*="error"]').count() > 0;
        if (errorVisible) {
          const errorText = await page.locator('.error, [class*="error"]').first().textContent() ?? 'Unknown error';
          console.warn(`[greenhouse/apply] Submission error: ${errorText}`);
          return { applied: false, skipped: false, error: errorText };
        }

        console.log('[greenhouse/apply] Submitted but no clear confirmation detected');
        return { applied: true, skipped: false };
      } else {
        console.warn('[greenhouse/apply] No submit button found');
        return { applied: false, skipped: false, error: 'No submit button found' };
      }
    }

    console.log('[greenhouse/apply] Form filled (submit=false, not submitting)');
    return { applied: false, skipped: false };
  } finally {
    await browser.close();
  }
}
