/**
 * Consolidated types and interfaces for the backend.
 * Single place to manage shared shapes (like shared/constants.ts for values).
 */

// Re-exports from modules that couple type + const (for single-file discovery)
export type { PipelineApplyOutcome, PipelineResultWithOutcome } from './pipeline-outcome.js';
export type { AppErrorCode } from './errors.js';
import type { PipelineApplyOutcome } from './pipeline-outcome.js';

// ── Job & profile (canonical) ─────────────────────────────────────────────

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
  /** Array of strings, or object mapping category name to string[] */
  skills?: unknown[] | Record<string, string[]>;
  [key: string]: unknown;
}

/** Apply state entry per job URL. */
export interface ApplicationState {
  resumePath?: string;
  uploadedAt?: string;
  submittedAt?: string;
}

// ── Config & user ─────────────────────────────────────────────────────────

export interface UserPaths {
  authState: string;
  navigationLog: string;
  resumesDir: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

// ── Pipeline & orchestration ──────────────────────────────────────────────

export interface RunPipelineForJobOptions {
  submit?: boolean;
  forceScrape?: boolean;
  userId?: string;
  coverPath?: string;
  onPhaseChange?: (phase: string) => void;
  jobId?: string;
  automationLevel?: 'full' | 'review';
}

export interface RunPipelineForJobResult {
  job: Job;
  resumePath?: string;
  outcome: PipelineApplyOutcome;
  paused?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OrchestratorResult {
  reply: string;
  meta?: {
    jobId?: string;
    pollStatus?: boolean;
  };
}

// ── Handshake apply ───────────────────────────────────────────────────────

export interface RunHandshakeApplyOptions {
  submit?: boolean;
  resumePath?: string;
  transcriptPath?: string;
  coverPath?: string;
  userId?: string;
}

export interface RunHandshakeApplyResult {
  applied: boolean;
  skipped?: boolean;
}

// ── Apply modal sections (must match SECTION_CONFIG keys in handshake-attach-helper) ──

export type SectionKey = 'transcript' | 'resume' | 'coverLetter';

export interface AttachSectionOptions {
  sectionHeading: string;
  searchPlaceholder: string;
  fileInputName: string;
  fileInputId?: string;
  filePath: string;
}

export interface PresentSectionConfig {
  key: SectionKey;
  sectionHeading: string;
  searchPlaceholder: string;
  fileInputName: string;
  fileInputId?: string;
}

// ── Resume & cover letter ────────────────────────────────────────────────

export interface GenerateCoverLetterOptions {
  profile?: Profile;
  job: Job;
  userId?: string;
  apiKey?: string;
  model?: string;
  outputDir?: string;
  forceRegenerate?: boolean;
}

export interface EnsureCoverLetterPdfFromDbOptions {
  outputDir?: string;
  profile?: Profile | null;
  job?: Job | null;
}

export interface RunResumeGeneratorOptions {
  profile?: Profile;
  job?: Job;
  profilePath?: string;
  jobPath?: string;
  outputDir?: string;
  userId?: string;
  theme?: string;
  useAssistant?: boolean;
  assistantApiKey?: string;
  assistantModel?: string;
  forceRegenerate?: boolean;
}

export interface RunResumeGeneratorResult {
  jobRef: string | null;
  resumePath: string | null;
}

export interface ExportResumeOptions {
  outputDir?: string;
  jobSlug?: string;
  resumeBasename?: string;
  theme?: string;
}

export interface EnsureResumePdfFromDbOptions {
  outputDir?: string;
  theme?: string;
  profile?: { name?: string } | null;
  job?: { title?: string; company?: string } | null;
}

export interface UpdateResumeForJobOptions {
  apiKey?: string;
  model?: string;
  userId?: string;
}

export interface GenerateResumeWithAssistantParams {
  profile: Profile;
  job?: Job;
  messages?: Array<{ role: string; content: string }>;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export interface UpdateResumeFromChatOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

// ── Job scraper & probe ──────────────────────────────────────────────────

export type ApplyType = 'apply' | 'apply_externally' | 'none';

export interface ScrapedJob {
  title: string;
  company: string;
  description: string;
  url?: string;
  applyType: ApplyType;
  applicationSubmitted: boolean;
  jobClosed?: boolean;
  appliedAt?: string;
}

export interface GetJobFromUrlOptions {
  useAuth?: boolean;
  cacheDir?: string;
  maxAgeMs?: number;
  headless?: boolean;
}

export interface GetApplicationStatusFromUrlOptions {
  headless?: boolean;
  useAuth?: boolean;
}

export interface ProbeResult {
  requiredSections: SectionKey[];
  cached: boolean;
}

export interface RunJobScraperOptions {
  cacheDir?: string;
  headless?: boolean;
  useAuth?: boolean;
  maxAgeMs?: number;
  forceScrape?: boolean;
}

export interface RunJobScraperResult {
  job: Job & { url?: string };
  jobsFilePath: string;
  fromStore?: boolean;
  htmlPath?: string | null;
}

export interface GetApplicationStatusOptions {
  fromStoreOnly?: boolean;
  userId?: string;
}

// ── Session & browser ────────────────────────────────────────────────────

export type SessionCheckResult =
  | { valid: true }
  | { valid: false; reason: 'no_session' | 'session_expired' };

export interface LaunchBrowserOptions {
  headless?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}

// ── Job profile mismatch & list ───────────────────────────────────────────

export type JobProfileMismatchSeverity = 'info' | 'warning' | 'blocker';

export interface JobProfileMismatchResult {
  hasMismatch: boolean;
  /** One concise sentence explaining the mismatch (already truncated for display). */
  reason?: string;
  /** How strong the mismatch is; defaults to 'warning' when hasMismatch is true. */
  severity?: JobProfileMismatchSeverity;
  /**
   * When true, the orchestrator should ask the user to confirm before proceeding
   * with apply (used for serious, high-risk mismatches).
   */
  requiresConfirmation?: boolean;
}

export interface JobWithStatus {
  job: Job & { jobId: string; site: string };
  jobUrl: string | null;
  applicationState: ApplicationState | null;
  hasResume: boolean;
  appliedAt?: string;
}

// ── Form capture & profile extraction ────────────────────────────────────

export interface FormSection {
  heading: string;
  fileInputs: Array<{ name?: string; id?: string }>;
}

export interface ApplyFormSchema {
  sections: FormSection[];
  capturedAt: string;
  presentSections?: PresentSectionConfig[];
}

export interface ExtractProfileFromResumeOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

// ── Fill form (demo) ─────────────────────────────────────────────────────

export interface FillJobApplicationFormOptions {
  firstName?: string;
  lastName?: string;
  email?: string;
  workAuth?: string;
  phone?: string;
  linkedin?: string;
  stopBeforeSubmit?: boolean;
  headless?: boolean;
  keepOpen?: boolean;
  screenshotDir?: string;
  runId?: number | null;
}
