/**
 * One-time migration: read existing JSON files and upsert into Postgres.
 * Run with: DATABASE_URL=... npx tsx scripts/migrate-file-data-to-db.ts
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { pool, ensureDataTables } from '../api/db.js';
import { PATHS } from '../shared/config.js';
import { normalizeUrl } from '../data/apply-state.js';
import type { Job } from '../shared/types.js';
import type { Profile } from '../shared/types.js';
import type { ApplicationState } from '../shared/types.js';
import type { UserJobState } from '../shared/types.js';

async function migrateJobs(): Promise<number> {
  let raw: string;
  try {
    raw = readFileSync(PATHS.jobsFile, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return 0;
    throw err;
  }
  const data = JSON.parse(raw) as Record<string, Record<string, Job>>;
  let count = 0;
  for (const [site, jobs] of Object.entries(data)) {
    if (!jobs || typeof jobs !== 'object') continue;
    for (const [jobId, job] of Object.entries(jobs)) {
      const j = job as Job;
      const payload: Record<string, unknown> = {};
      const known = new Set(['title', 'company', 'description', 'url', 'jobId', 'site', 'applyType', 'jobClosed']);
      for (const [k, v] of Object.entries(j)) {
        if (!known.has(k)) payload[k] = v;
      }
      await pool.query(
        `INSERT INTO jobs (site, job_id, title, company, description, url, apply_type, job_closed, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (site, job_id) DO UPDATE SET
           title = EXCLUDED.title,
           company = EXCLUDED.company,
           description = EXCLUDED.description,
           url = EXCLUDED.url,
           apply_type = EXCLUDED.apply_type,
           job_closed = EXCLUDED.job_closed,
           payload = EXCLUDED.payload,
           updated_at = now()`,
        [
          site,
          jobId,
          j.title ?? null,
          j.company ?? null,
          j.description ?? null,
          j.url ?? null,
          j.applyType ?? null,
          j.jobClosed ?? null,
          JSON.stringify(payload),
        ]
      );
      count++;
    }
  }
  return count;
}

async function migrateProfiles(): Promise<number> {
  let raw: string;
  try {
    raw = readFileSync(PATHS.profile, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return 0;
    throw err;
  }
  const data = JSON.parse(raw) as Record<string, Partial<Profile>>;
  let count = 0;
  for (const [userId, profile] of Object.entries(data)) {
    if (!profile || typeof profile !== 'object') continue;
    const payload: Record<string, unknown> = {};
    const known = new Set(['name', 'email', 'phone', 'linkedin', 'summary', 'education', 'experience', 'skills']);
    for (const [k, v] of Object.entries(profile)) {
      if (!known.has(k)) payload[k] = v;
    }
    await pool.query(
      `INSERT INTO profiles (user_id, name, email, phone, linkedin, summary, education, experience, skills, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         linkedin = EXCLUDED.linkedin,
         summary = EXCLUDED.summary,
         education = EXCLUDED.education,
         experience = EXCLUDED.experience,
         skills = EXCLUDED.skills,
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [
        userId,
        profile.name ?? null,
        profile.email ?? null,
        profile.phone ?? null,
        profile.linkedin ?? null,
        profile.summary ?? null,
        JSON.stringify(profile.education ?? []),
        JSON.stringify(profile.experience ?? []),
        JSON.stringify(profile.skills ?? []),
        JSON.stringify(payload),
      ]
    );
    count++;
  }
  return count;
}

async function migrateApplyState(): Promise<number> {
  let raw: string;
  try {
    raw = readFileSync(PATHS.applyState, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return 0;
    throw err;
  }
  const data = JSON.parse(raw) as Record<string, Record<string, ApplicationState>>;
  let count = 0;
  for (const [userId, byUrl] of Object.entries(data)) {
    if (!byUrl || typeof byUrl !== 'object') continue;
    for (const [jobUrl, state] of Object.entries(byUrl)) {
      const key = normalizeUrl(jobUrl);
      const uploadedAt = state.uploadedAt ? new Date(state.uploadedAt).toISOString() : null;
      const submittedAt = state.submittedAt ? new Date(state.submittedAt).toISOString() : null;
      await pool.query(
        `INSERT INTO apply_state (user_id, job_url_normalized, resume_path, uploaded_at, submitted_at)
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
         ON CONFLICT (user_id, job_url_normalized) DO UPDATE SET
           resume_path = EXCLUDED.resume_path,
           uploaded_at = COALESCE(EXCLUDED.uploaded_at, apply_state.uploaded_at),
           submitted_at = COALESCE(EXCLUDED.submitted_at, apply_state.submitted_at),
           updated_at = now()`,
        [userId, key, state.resumePath ?? null, uploadedAt, submittedAt]
      );
      count++;
    }
  }
  return count;
}

async function migrateUserJobState(): Promise<number> {
  let raw: string;
  try {
    raw = readFileSync(PATHS.userJobState, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return 0;
    throw err;
  }
  const data = JSON.parse(raw) as Record<string, Record<string, UserJobState>>;
  let count = 0;
  for (const [userId, byRef] of Object.entries(data)) {
    if (!byRef || typeof byRef !== 'object') continue;
    for (const [jobRef, state] of Object.entries(byRef)) {
      await pool.query(
        `INSERT INTO user_job_state (user_id, job_ref, resume_basename, application_submitted, applied_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, job_ref) DO UPDATE SET
           resume_basename = COALESCE(EXCLUDED.resume_basename, user_job_state.resume_basename),
           application_submitted = COALESCE(EXCLUDED.application_submitted, user_job_state.application_submitted),
           applied_at = COALESCE(EXCLUDED.applied_at, user_job_state.applied_at),
           updated_at = now()`,
        [
          userId,
          jobRef,
          state.resumeBasename ?? null,
          state.applicationSubmitted ?? null,
          state.appliedAt ?? null,
        ]
      );
      count++;
    }
  }
  return count;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  console.log('Ensuring tables exist...');
  await ensureDataTables();
  console.log('Migrating jobs...');
  const jobsCount = await migrateJobs();
  console.log('Migrated', jobsCount, 'jobs');
  console.log('Migrating profiles...');
  const profilesCount = await migrateProfiles();
  console.log('Migrated', profilesCount, 'profiles');
  console.log('Migrating apply_state...');
  const applyStateCount = await migrateApplyState();
  console.log('Migrated', applyStateCount, 'apply_state rows');
  console.log('Migrating user_job_state...');
  const ujsCount = await migrateUserJobState();
  console.log('Migrated', ujsCount, 'user_job_state rows');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
