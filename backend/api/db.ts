/**
 * Postgres client and users table helpers (Supabase / DATABASE_URL).
 */
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz DEFAULT now()
  )
`;

const JOBS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS jobs (
    site text NOT NULL,
    job_id text NOT NULL,
    title text,
    company text,
    description text,
    url text,
    apply_type text,
    job_closed boolean,
    payload jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (site, job_id)
  )
`;

const PROFILES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS profiles (
    user_id text PRIMARY KEY,
    name text,
    email text,
    phone text,
    linkedin text,
    summary text,
    education jsonb DEFAULT '[]',
    experience jsonb DEFAULT '[]',
    skills jsonb DEFAULT '[]',
    payload jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now()
  )
`;

const APPLY_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS apply_state (
    user_id text NOT NULL,
    job_url_normalized text NOT NULL,
    resume_path text,
    uploaded_at timestamptz,
    submitted_at timestamptz,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, job_url_normalized)
  )
`;

const USER_JOB_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_job_state (
    user_id text NOT NULL,
    job_ref text NOT NULL,
    resume_basename text,
    application_submitted boolean,
    applied_at text,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, job_ref)
  )
`;

const HANDSHAKE_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS handshake_sessions (
    user_id text PRIMARY KEY,
    state_json jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
  )
`;

const JOB_ARTIFACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS job_artifacts (
    user_id text NOT NULL,
    job_ref text NOT NULL,
    artifact_type text NOT NULL,
    content jsonb NOT NULL,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, job_ref, artifact_type),
    CONSTRAINT job_artifacts_type_check CHECK (artifact_type IN ('resume', 'cover_letter', 'written_document'))
  )
`;

const USER_PREFERENCES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id text PRIMARY KEY,
    onboarding_complete boolean DEFAULT false,
    automation_level text DEFAULT 'review',
    updated_at timestamptz DEFAULT now()
  )
`;

const USER_RESUMES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_resumes (
    user_id text PRIMARY KEY,
    content jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
  )
`;

const PIPELINE_JOBS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    job_url text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    submit boolean NOT NULL DEFAULT false,
    force_scrape boolean NOT NULL DEFAULT false,
    result jsonb,
    error text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  )
`;

const USER_DISCOVERED_JOBS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_discovered_jobs (
    user_id text NOT NULL,
    job_ref text NOT NULL,
    discovered_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, job_ref)
  )
`;

const CHAT_MESSAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
  )
`;
const CHAT_MESSAGES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS chat_messages_user_created_idx ON chat_messages (user_id, created_at)
`;

let usersTableInitialized = false;
let dataTablesInitialized = false;

async function ensureUsersTable(): Promise<void> {
  if (usersTableInitialized) return;
  await pool.query(USERS_TABLE_SQL);
  usersTableInitialized = true;
}


/** Creates jobs, profiles, apply_state, user_job_state. Call from data layer or migration. */
export async function ensureDataTables(): Promise<void> {
  if (dataTablesInitialized) return;
  await pool.query(JOBS_TABLE_SQL);
  await pool.query(PROFILES_TABLE_SQL);
  await pool.query(APPLY_STATE_TABLE_SQL);
  await pool.query(USER_JOB_STATE_TABLE_SQL);
  await pool.query(HANDSHAKE_SESSIONS_TABLE_SQL);
  await pool.query(JOB_ARTIFACTS_TABLE_SQL);
  await pool.query(USER_PREFERENCES_TABLE_SQL);
  await pool.query(USER_RESUMES_TABLE_SQL);
  await pool.query(USER_DISCOVERED_JOBS_TABLE_SQL);
  await pool.query(PIPELINE_JOBS_TABLE_SQL);
  await pool.query(CHAT_MESSAGES_TABLE_SQL);
  await pool.query(CHAT_MESSAGES_INDEX_SQL);
  await pool.query('ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS phase text DEFAULT NULL');
  await pool.query('ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS error_code text');
  await pool.query("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS automation_level text DEFAULT 'review'");
  await pool.query("ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS automation_level text DEFAULT 'review'");
  await pool.query('ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS artifacts jsonb');
  await pool.query('ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS transcript_storage_key text');
  await pool.query('ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS last_refresh_at timestamptz');
  await pool.query('ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS job_search_filters jsonb');
  await pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location text');
  await pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_employment_type text');
  await pool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_logo_url text');
  await pool.query("ALTER TABLE job_artifacts ADD COLUMN IF NOT EXISTS edit_history jsonb DEFAULT '[]'::jsonb");
  // Expand artifact_type constraint to include written_document (safe if already correct)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE job_artifacts DROP CONSTRAINT IF EXISTS job_artifacts_type_check;
      ALTER TABLE job_artifacts ADD CONSTRAINT job_artifacts_type_check
        CHECK (artifact_type IN ('resume', 'cover_letter', 'written_document'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$
  `);
  await pool.query("ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS lifecycle_status text");
  await pool.query("ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS saved_at timestamptz");

  // ── Dynamic application forms ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS application_forms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      job_ref text NOT NULL,
      site text NOT NULL DEFAULT 'handshake',
      schema jsonb NOT NULL DEFAULT '{}',
      classified_fields jsonb NOT NULL DEFAULT '[]',
      answers jsonb NOT NULL DEFAULT '[]',
      status text NOT NULL DEFAULT 'draft',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(user_id, job_ref)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_answers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      intent text NOT NULL,
      question_hash text,
      answer_value text NOT NULL,
      used_count int DEFAULT 1,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(user_id, intent, question_hash)
    )
  `);
  await pool.query("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extended jsonb DEFAULT '{}'");
  await pool.query('ALTER TABLE job_artifacts ADD COLUMN IF NOT EXISTS artifact_id text');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS job_artifacts_artifact_id_unique ON job_artifacts (artifact_id) WHERE artifact_id IS NOT NULL');
  dataTablesInitialized = true;
}

import type { User } from '../shared/types.js';
export type { User } from '../shared/types.js';

export async function createUser(email: string, passwordHash: string): Promise<User> {
  await ensureUsersTable();
  const res = await pool.query<User>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, created_at',
    [email, passwordHash]
  );
  return res.rows[0];
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureUsersTable();
  const res = await pool.query<User>('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [
    email,
  ]);
  return res.rows[0] ?? null;
}
