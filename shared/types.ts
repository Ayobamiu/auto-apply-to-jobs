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

/** Profile shape (data/profile.json). */
export interface Profile {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  summary?: string;
  education?: unknown[];
  experience?: unknown[];
  skills?: unknown[];
  [key: string]: unknown;
}

/** Apply state entry per job URL. */
export interface ApplicationState {
  resumePath?: string;
  uploadedAt?: string;
  submittedAt?: string;
}
