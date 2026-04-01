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
  location?: string;
  salaryEmploymentType?: string;
  companyLogoUrl?: string;
  [key: string]: unknown;
}

/** Per-user state for a job (resume used, applied or not). */
export interface UserJobState {
  resumeBasename?: string;
  applicationSubmitted?: boolean;
  appliedAt?: string;
  /** Job lifecycle state: saved → in_progress → submitted. */
  lifecycleStatus?: 'saved' | 'in_progress' | 'submitted';
  savedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile types
// Extended fields are now top-level on Profile.
// ExtendedProfileFields is kept for reference / legacy reads, but deprecated.
// ─────────────────────────────────────────────────────────────────────────────

/** One education entry in a profile. */
export interface EducationEntry {
  school?: string;
  degree?: string;
  discipline?: string;
  year?: string;
  startMonth?: string | number;
  startYear?: string | number;
  endMonth?: string | number;
  endYear?: string | number;
  [key: string]: unknown;
}

/** One experience entry in a profile. */
export interface ExperienceEntry {
  title?: string;
  company?: string;
  location?: string;
  dates?: string;
  bullets?: string[];
  startMonth?: string | number;
  startYear?: string | number;
  endMonth?: string | number;
  endYear?: string | number;
  [key: string]: unknown;
}

/** One project entry in a profile. */
export interface ProjectEntry {
  name?: string;
  bullets?: string[];
}

/** GDPR / data compliance flags (maps to the POST body's data_compliance fields). */
export interface DataCompliance {
  /** @deprecated Use gdpr_processing_consent_given + gdpr_retention_consent_given instead. */
  gdpr_consent_given?: boolean;
  gdpr_processing_consent_given?: boolean;
  gdpr_retention_consent_given?: boolean;
  gdpr_demographic_data_consent_given?: boolean;
}

/** One EEO demographic answer (maps to demographic_answers[] in the POST body). */
export interface DemographicAnswer {
  question_id: number;
  answer_options: Array<{
    answer_option_id: number;
    text?: string; // for free-form answers
  }>;
}

/**
 * Profile shape — matches public.profiles table.
 *
 * All previously-extended fields are promoted here.
 * The `extended` column on the DB row is deprecated and will be dropped.
 */
export interface Profile {
  // ── Core identity ──────────────────────────────────────────
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  summary?: string;
  location?: string;
  title?: string;

  // ── Resume sections ────────────────────────────────────────
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  projects?: ProjectEntry[];
  /** Array of skill objects, or object mapping category → string[] */
  skills?: Array<{ category: string; keywords: string[] }> | Record<string, string[]>;

  // ── Promoted from ExtendedProfileFields ───────────────────
  website?: string;
  github?: string;
  work_authorization?: string;
  requires_visa_sponsorship?: boolean;
  willing_to_relocate?: boolean;
  preferred_locations?: string[];
  /** ISO date string e.g. "2024-09-01" */
  availability_start_date?: string;
  current_degree_status?: string;
  expected_graduation?: string;
  eeo_gender?: string;
  eeo_race?: string;
  eeo_veteran_status?: string;
  eeo_disability_status?: string;
  referral_source?: string;

  // ── Net-new: location coordinates ─────────────────────────
  latitude?: number;
  longitude?: number;

  // ── Net-new: stored file references ───────────────────────
  resume_url?: string;
  cover_letter_url?: string;

  // ── Net-new: application submission metadata ───────────────
  /** Greenhouse mapped_url_token for pre-filled job application routing. */
  mapped_url_token?: string;
  data_compliance?: DataCompliance;
  demographic_answers?: DemographicAnswer[];

  // ── DB metadata ────────────────────────────────────────────
  updated_at?: string;

  /**
   * @deprecated Nulled in DB migration. Will be dropped.
   * Use top-level fields instead.
   */
  extended?: null;

  /** Catch-all for any remaining untyped payload fields. */
  payload?: Record<string, unknown>;

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
  /** Freemium monetization status. */
  subscription_status?: 'free' | 'pro' | 'cancelled';
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: Date | null;
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
  /** When provided, pipeline checks this before/after phases and throws if true (cancelled). */
  checkCancelled?: () => Promise<boolean>;
  forceRegenerate?: boolean;
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
    /** When false, do not mark onboarding complete (e.g. waiting for transcript upload). */
    onboardingComplete?: boolean;
  };
}

/** Chat intent classification (keyword or LLM). Used by orchestrator and intent-from-llm. */
export type Intent =
  | 'connect_handshake'
  | 'set_profile'
  | 'update_profile'
  | 'apply'
  | 'check_status'
  | 'list_jobs'
  | 'find_jobs'
  | 'approve'
  | 'cancel'
  | 'help';

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

/** Section keys we support (resume, transcript, cover letter only). Jobs requiring other document types are rejected. */
export const SUPPORTED_SECTION_KEYS: readonly SectionKey[] = ['resume', 'transcript', 'coverLetter'];

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
  /** When set, used as main source for tailoring (assistant tailors this JSON to the job). */
  baseResumeJson?: Record<string, unknown>;
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
  /** When set, assistant tailors this JSON Resume to the job instead of building from profile. */
  baseResumeJson?: Record<string, unknown>;
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
  /** Load Handshake cookies from DB (`handshake_sessions`) or `.auth/<userId>/` fallback. */
  userId?: string;
}

export interface GetApplicationStatusFromUrlOptions {
  headless?: boolean;
  useAuth?: boolean;
  userId?: string;
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
  userId?: string;
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

// ══════════════════════════════════════════════════════════════════════════
// ── Dynamic Application Forms (platform-agnostic) ────────────────────────
// ══════════════════════════════════════════════════════════════════════════

export type FormFieldType =
  | 'file_upload'
  | 'text'
  | 'textarea'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'number';

export interface FieldOption {
  label: string;
  value: string;
}

/** Site-specific DOM selectors needed to fill a field at submission time. */
export interface FieldSelectors {
  inputSelector: string;
  /** Stable input name (Handshake); use input[name="..."] at fill time instead of dynamic IDs. */
  inputName?: string;
  /** Stable select name (Handshake); use select[name="..."] to find combobox, then select option by text. */
  selectName?: string;
  optionSelectors?: Record<string, string>;
  fileInputName?: string;
  searchPlaceholder?: string;
}

/** A single form field normalized from any job site. */
export interface NormalizedFormField {
  id: string;
  rawLabel: string;
  rawInstructions?: string;
  fieldType: FormFieldType;
  required: boolean;
  options?: FieldOption[];
  sectionHeading?: string;
  sectionCategory?: 'document_upload' | 'screening_questions' | 'employer_questions' | 'eeo' | 'other';
  selectors: FieldSelectors;
}

/** Full form schema extracted from a job application page. */
export interface NormalizedFormSchema {
  jobRef: string;
  site: string;
  extractedAt: string;
  fields: NormalizedFormField[];
  presentSections?: PresentSectionConfig[];
}

// ── Field intent classification ──────────────────────────────────────────

export type FieldIntent =
  // Document uploads
  | 'upload_resume'
  | 'upload_cover_letter'
  | 'upload_transcript'
  | 'upload_other_document'
  // Contact / profile
  | 'phone'
  | 'email'
  | 'full_name'
  | 'linkedin_url'
  | 'website_url'
  | 'github_url'
  | 'address'
  // Education / eligibility
  | 'degree_status'
  | 'graduation_date'
  | 'school_name'
  | 'major'
  | 'gpa'
  //Company 
  | 'company_name'
  | 'company_location'
  | 'company_industry'
  | 'company_size'
  | 'company_website'
  | 'company_linkedin'
  | 'company_twitter'
  | 'company_facebook'
  | 'company_instagram'
  | 'degree_name'
  | 'start_year'
  | 'end_year'
  | 'discipline_name'
  | 'start_month'
  | 'end_month'
  | 'title'
  // Work authorization
  | 'work_authorization'
  | 'visa_sponsorship'
  | 'relocation_willingness'
  | 'availability_start_date'
  | 'availability_schedule'
  // EEO (voluntary)
  | 'eeo_gender'
  | 'eeo_race'
  | 'eeo_veteran_status'
  | 'eeo_disability'
  // Screening
  | 'screening_yes_no'
  | 'screening_open_ended'
  // Referral / source
  | 'referral_source'
  | 'referral_details'
  // Data sharing consent
  | 'data_sharing_consent'
  // Fallback
  | 'unknown';

/** A form field after intent classification. */
export interface ClassifiedField extends NormalizedFormField {
  intent: FieldIntent;
  confidence: number;
}

// ── Answer generation ────────────────────────────────────────────────────

export type AnswerSource =
  | 'profile'
  | 'saved_answer'
  | 'ai_generated'
  | 'default_rule'
  | 'user_manual';

export interface GeneratedAnswer {
  fieldId: string;
  intent: FieldIntent;
  value: string | string[];
  source: AnswerSource;
  confidence: number;
  requiresReview: boolean;
}

/** Stored form state per job per user. */
export interface ApplicationFormRecord {
  id?: string;
  userId: string;
  jobRef: string;
  site: string;
  schema: NormalizedFormSchema;
  classifiedFields: ClassifiedField[];
  answers: GeneratedAnswer[];
  status: 'draft' | 'reviewed' | 'submitted';
  createdAt?: string;
  updatedAt?: string;
}

/** Reusable answer across jobs. */
export interface SavedAnswer {
  id?: string;
  userId: string;
  intent: FieldIntent;
  questionHash?: string;
  answerValue: string;
  usedCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Extended profile fields ──────────────────────────────────────────────
/** @deprecated All fields are now top-level on Profile. */
export interface ExtendedProfileFields {
  website?: string;
  github?: string;
  work_authorization?: string;
  requires_visa_sponsorship?: boolean;
  willing_to_relocate?: boolean;
  preferred_locations?: string[];
  availability_start_date?: string;
  current_degree_status?: string;
  expected_graduation?: string;
  eeo_gender?: string;
  eeo_race?: string;
  eeo_veteran_status?: string;
  eeo_disability_status?: string;
  referral_source?: string;
}

// ── Site form extractor interface ────────────────────────────────────────

export interface SiteFormExtractorResult {
  schema: NormalizedFormSchema;
  presentSections: PresentSectionConfig[];
}

/**
 * Formal site adapter contract. Each job site implements this interface.
 * New sites (LinkedIn, Greenhouse, etc.) can be added by implementing this
 * and registering in the adapter registry.
 */
export interface SiteFormExtractor {
  /** Unique site identifier (e.g. 'handshake', 'linkedin'). */
  site: string;
  /** Extract form fields from the live page modal/form. */
  extractForm(page: unknown, modalLocator: unknown, jobRef: string): Promise<SiteFormExtractorResult>;
  /** Fill non-file form fields using classified fields and answers. */
  fillForm(page: unknown, modalLocator: unknown, fields: ClassifiedField[], answers: GeneratedAnswer[]): Promise<Array<{ fieldId: string; success: boolean; error?: string }>>;
}

export interface OnboardingStatusResponse {
  resume_uploaded: boolean;
  profile_complete: boolean;
  handshake_connected: boolean;
  transcript_uploaded: boolean;
}