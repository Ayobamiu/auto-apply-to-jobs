/**
 * Postgres client and users table helpers (Supabase / DATABASE_URL).
 */
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
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

let tableInitialized = false;

async function ensureUsersTable(): Promise<void> {
  if (tableInitialized) return;
  await pool.query(USERS_TABLE_SQL);
  tableInitialized = true;
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
