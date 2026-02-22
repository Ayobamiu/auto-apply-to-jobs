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
  dataTablesInitialized = true;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

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
