/** Canonical job metadata (shared; no per-user fields). Per-user state in user-job-state. */
export interface Job {
  title?: string;
  company?: string;
  description?: string;
  url?: string;
  jobId?: string;
  site?: string;
  applyType?: string;
  jobClosed?: boolean;
  [key: string]: unknown;
}

/** Per-user state for a job (resume used, applied or not). */
export interface UserJobState {
  resumeBasename?: string;
  applicationSubmitted?: boolean;
  appliedAt?: string;
}

/** One education entry in a profile. */
export interface EducationEntry {
  school?: string;
  degree?: string;
  year?: string;
  [key: string]: unknown;
}

/** One experience entry in a profile. */
export interface ExperienceEntry {
  title?: string;
  company?: string;
  location?: string;
  dates?: string;
  bullets?: string[];
  [key: string]: unknown;
}

/** Profile shape (data/profile.json). */
export interface Profile {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  summary?: string;
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  /** Array of strings, or object mapping category name to string[] (e.g. {"Backend": ["Node.js", ...]}) */
  skills?: unknown[] | Record<string, string[]>;
  [key: string]: unknown;
}

/** Apply state entry per job URL. */
export interface ApplicationState {
  resumePath?: string;
  uploadedAt?: string;
  submittedAt?: string;
}
