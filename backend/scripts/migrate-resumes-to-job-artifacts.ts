/**
 * One-time migration: read existing resume JSON files from data/resumes/<userId>/
 * and insert into job_artifacts table.
 * Map basename to job_ref via user_job_state.
 * Run with: DATABASE_URL=... npx tsx scripts/migrate-resumes-to-job-artifacts.ts
 */
import 'dotenv/config';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { pool, ensureDataTables } from '../api/db.js';
import { PATHS } from '../shared/config.js';

function validateResumeContent(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Resume must be a valid JSON object');
  }
  const obj = json as Record<string, unknown>;
  if (Object.keys(obj).length === 0) throw new Error('Resume cannot be empty');
  if (!obj.basics && !obj.$schema) throw new Error('Resume must have basics or $schema');
  return obj;
}

async function main(): Promise<void> {
  await ensureDataTables();
  const resumesDir = PATHS.resumes;
  if (!existsSync(resumesDir)) {
    console.log('No data/resumes directory, nothing to migrate.');
    return;
  }
  const userIds = readdirSync(resumesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  let migrated = 0;
  let skipped = 0;
  for (const userId of userIds) {
    const userDir = join(resumesDir, userId);
    const files = readdirSync(userDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const basename = file.replace(/\.json$/, '');
      const res = await pool.query<{ job_ref: string }>(
        'SELECT job_ref FROM user_job_state WHERE user_id = $1 AND resume_basename = $2',
        [userId, basename]
      );
      const row = res.rows[0];
      if (!row) {
        console.log(`Skip ${userId}/${file}: no matching user_job_state row`);
        skipped++;
        continue;
      }
      const jobRef = row.job_ref;
      const filePath = join(userDir, file);
      let raw: string;
      try {
        raw = readFileSync(filePath, 'utf8');
      } catch (err) {
        console.log(`Skip ${filePath}: read failed`, (err as Error).message);
        skipped++;
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (err) {
        console.log(`Skip ${filePath}: invalid JSON`);
        skipped++;
        continue;
      }
      try {
        validateResumeContent(json);
      } catch (err) {
        console.log(`Skip ${filePath}:`, (err as Error).message);
        skipped++;
        continue;
      }
      await pool.query(
        `INSERT INTO job_artifacts (user_id, job_ref, artifact_type, content, updated_at)
         VALUES ($1, $2, 'resume', $3::jsonb, now())
         ON CONFLICT (user_id, job_ref, artifact_type) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
        [userId, jobRef, raw]
      );
      console.log(`Migrated ${userId}/${file} -> job_ref=${jobRef}`);
      migrated++;
    }
  }
  console.log(`Done. Migrated ${migrated}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
