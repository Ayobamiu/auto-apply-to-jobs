/** Minimal job shape used across scrape, pipeline, apply. */
export interface Job {
  title?: string;
  company?: string;
  description?: string;
  url?: string;
  jobId?: string;
  site?: string;
  resumeBasename?: string;
  applicationSubmitted?: boolean;
  appliedAt?: string;
  applyType?: string;
  jobClosed?: boolean;
  [key: string]: unknown;
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
