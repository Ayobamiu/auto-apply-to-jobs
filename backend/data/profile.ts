/**
 * Profile data: multi-user, Postgres-backed.
 */
import { pool, ensureDataTables } from '../api/db.js';
import type { Profile } from '../shared/types.js';

const DEFAULT_USER_ID = 'default';

const DEFAULT_PROFILE: Profile = {
  name: '',
  email: '',
  phone: '',
  linkedin: '',
  summary: '',
  education: [],
  experience: [],
  skills: [],
};

interface ProfileRow {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  summary: string | null;
  education: unknown;
  experience: unknown;
  skills: unknown;
  payload: Record<string, unknown>;
}

function rowToProfile(row: ProfileRow | null): Profile {
  if (!row) return { ...DEFAULT_PROFILE };
  const base: Profile = {
    name: row.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    linkedin: row.linkedin ?? '',
    summary: row.summary ?? '',
    education: Array.isArray(row.education) ? row.education : [],
    experience: Array.isArray(row.experience) ? row.experience : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
  };
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return { ...base, ...payload };
}

export async function getProfile(userId?: string): Promise<Profile> {
  const uid = userId ?? DEFAULT_USER_ID;
  await ensureDataTables();
  const res = await pool.query<ProfileRow>(
    'SELECT user_id, name, email, phone, linkedin, summary, education, experience, skills, payload FROM profiles WHERE user_id = $1',
    [uid]
  );
  return rowToProfile(res.rows[0] ?? null);
}

export async function updateProfile(data: Partial<Profile>, userId?: string): Promise<void> {
  const uid = userId ?? DEFAULT_USER_ID;
  await ensureDataTables();
  const existing = await getProfile(uid);
  const merged = { ...DEFAULT_PROFILE, ...existing, ...data };
  const payload: Record<string, unknown> = {};
  const knownKeys = new Set(['name', 'email', 'phone', 'linkedin', 'summary', 'education', 'experience', 'skills']);
  for (const [k, v] of Object.entries(merged)) {
    if (knownKeys.has(k)) continue;
    payload[k] = v;
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
      uid,
      merged.name ?? null,
      merged.email ?? null,
      merged.phone ?? null,
      merged.linkedin ?? null,
      merged.summary ?? null,
      JSON.stringify(merged.education ?? []),
      JSON.stringify(merged.experience ?? []),
      JSON.stringify(merged.skills ?? []),
      JSON.stringify(payload),
    ]
  );
}
