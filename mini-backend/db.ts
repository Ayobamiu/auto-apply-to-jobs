/**
 * Postgres: pool and handshake_sessions table only.
 */
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase in many environments
  }
});

const HANDSHAKE_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS handshake_sessions (
    user_id text PRIMARY KEY,
    state_json jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
  )
`;

let initialized = false;

export async function ensureHandshakeTable(): Promise<void> {
  if (initialized) return;
  await pool.query(HANDSHAKE_SESSIONS_TABLE_SQL);
  initialized = true;
}

export async function saveHandshakeSession(userId: string, stateJson: object): Promise<void> {
  await ensureHandshakeTable();
  await pool.query(
    `INSERT INTO handshake_sessions (user_id, state_json, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = now()`,
    [userId, JSON.stringify(stateJson)]
  );
}
