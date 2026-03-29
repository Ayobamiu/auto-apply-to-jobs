const API_BASE = import.meta.env.VITE_API_BASE;
if (!API_BASE) {
  throw new Error('API_BASE is not set');
}
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void): void {
  onUnauthorized = cb;
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function clearToken(): void {
  localStorage.removeItem('token');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function getUserIdFromToken(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error('Session expired. Please sign in again.');
  }

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return body as T;
}

export interface AuthResponse {
  token?: string;
  id?: string;
  email?: string;
  error?: string;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.token) setToken(res.token);
  return res;
}

export interface ProfileFromResumeResponse {
  profile: Record<string, unknown>;
}

export interface ProfileResponse {
  profile: Record<string, unknown> | null;
  automationLevel?: string;
}

export interface OnboardingStatusResponse {
  resume_uploaded: boolean;
  profile_complete: boolean;
  handshake_connected: boolean;
  transcript_uploaded: boolean;
}

export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  return request<OnboardingStatusResponse>('/user/onboarding-status');
}

export async function getProfile(): Promise<ProfileResponse> {
  return request<ProfileResponse>('/profile');
}

export async function putProfile(data: Record<string, unknown>): Promise<ProfileResponse> {
  return request<ProfileResponse>('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getTranscriptStatus(): Promise<{ hasTranscript: boolean; transcriptStorageKey: string | null }> {
  return request<{ hasTranscript: boolean; transcriptStorageKey: string | null }>('/users/me/transcript');
}

/** Get a presigned URL to preview the transcript PDF in the browser. */
export async function getTranscriptPreviewUrl(): Promise<{ url: string }> {
  return request<{ url: string }>('/users/me/transcript/preview-url');
}

/** Upload a resume PDF to set profile; extracts text and saves profile. */
export async function uploadResumePdf(file: File): Promise<ProfileFromResumeResponse> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch(`${API_BASE}/profile/from-resume`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error('Session expired. Please sign in again.');
  }
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || body.message || `Upload failed (${res.status})`);
  }
  return body as ProfileFromResumeResponse;
}

/** Upload transcript PDF for jobs that require it. */
export async function uploadTranscript(file: File): Promise<{ ok: boolean; message?: string }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const form = new FormData();
  form.append('transcript', file);
  const res = await fetch(`${API_BASE}/users/me/transcript`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error('Session expired. Please sign in again.');
  }
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || body.message || `Upload failed (${res.status})`);
  }
  return body as { ok: boolean; message?: string };
}

/** Base resume JSON (for tailoring per job). */
export interface BaseResumeResponse {
  resume: Record<string, unknown>;
}

export async function getBaseResume(): Promise<BaseResumeResponse> {
  return request<BaseResumeResponse>('/users/me/resume');
}

export async function postBaseResumeFile(file: File): Promise<BaseResumeResponse> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch(`${API_BASE}/users/me/resume`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error('Session expired. Please sign in again.');
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    if (text.startsWith('<')) throw new Error('Server returned HTML — is the API running and the dev proxy set up? (e.g. proxy /users to backend)');
    throw new Error(text || `Upload failed (${res.status})`);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || body.message || `Upload failed (${res.status})`);
  return body as BaseResumeResponse;
}

export async function postBaseResumeText(resumeText: string): Promise<BaseResumeResponse> {
  return request<BaseResumeResponse>('/users/me/resume', {
    method: 'POST',
    body: JSON.stringify({ resumeText }),
  });
}

export async function putBaseResume(resume: Record<string, unknown>): Promise<BaseResumeResponse> {
  return request<BaseResumeResponse>('/users/me/resume', {
    method: 'PUT',
    body: JSON.stringify(resume),
  });
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatResponse {
  reply: string;
  meta?: {
    jobId?: string;
    pollStatus?: boolean;
  };
  error?: string;
}

export async function getChatMessages(limit: number = 50): Promise<{ messages: ChatMessage[] }> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  return request<{ messages: ChatMessage[] }>(`/chat/messages?${params.toString()}`);
}

export async function sendChat(
  message: string,
  messages: ChatMessage[] = []
): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, messages }),
  });
}

/** Snapshot of resume/cover used when the job was submitted (in result.appliedArtifacts). */
export interface AppliedArtifacts {
  resume?: Record<string, unknown> | null;
  coverLetter?: { text: string } | null;
}

export interface PipelineJobStatus {
  status: string;
  phase: string | null;
  jobUrl?: string;
  submit?: boolean;
  result?: { appliedArtifacts?: AppliedArtifacts; job?: unknown; outcome?: string };
  error?: string | null;
  /** User-facing message when status is 'done' (single source of truth from backend) */
  userMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function getPipelineJobStatus(jobId: string): Promise<PipelineJobStatus> {
  return request<PipelineJobStatus>(`/pipeline/jobs/${encodeURIComponent(jobId)}`);
}

// ── Dynamic application forms ────────────────────────────────────────────

export interface ClassifiedFieldOption {
  label: string;
  value: string;
}

export interface ClassifiedField {
  id: string;
  rawLabel: string;
  rawInstructions?: string;
  fieldType: 'file_upload' | 'text' | 'textarea' | 'select' | 'multi_select' | 'radio' | 'checkbox';
  required: boolean;
  options?: ClassifiedFieldOption[];
  sectionHeading?: string;
  sectionCategory?: string;
  intent: string;
  confidence: number;
  selectors: Record<string, unknown>;
}

export interface GeneratedAnswer {
  fieldId: string;
  intent: string;
  value: string | string[];
  source: 'profile' | 'saved_answer' | 'ai_generated' | 'default_rule' | 'user_manual';
  confidence: number;
  requiresReview: boolean;
}

export interface DynamicFormData {
  classifiedFields: ClassifiedField[];
  answers: GeneratedAnswer[];
  status: 'draft' | 'reviewed' | 'submitted';
}

export interface WrittenDocumentData {
  text: string;
  instructions?: string;
}

export interface WrittenDocumentArtifact {
  artifactId: string | null;
  text: string;
  instructions?: string;
}

export interface PipelineArtifacts {
  resume: Record<string, unknown> | null;
  cover: { text: string } | null;
  jobTitle: string;
  requiredSections?: string[];
  hasDynamicForm?: boolean;
  dynamicForm?: DynamicFormData | null;
  hasWrittenDocument?: boolean;
  writtenDocument?: WrittenDocumentData | null;
  writtenDocuments?: WrittenDocumentArtifact[] | null;
}

export async function getPipelineArtifacts(jobId: string): Promise<PipelineArtifacts> {
  return request<PipelineArtifacts>(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts`);
}

export async function putPipelineArtifactResume(jobId: string, json: Record<string, unknown>): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/resume`, {
    method: 'PUT',
    body: JSON.stringify(json),
  });
}

export async function putPipelineArtifactCover(jobId: string, text: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/cover`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

export async function approvePipelineJob(jobId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/pipeline/jobs/${encodeURIComponent(jobId)}/approve`, {
    method: 'POST',
  });
}

export async function cancelPipelineJob(jobId: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(`/pipeline/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

/** Start pipeline for a job URL (e.g. from Discover jobs). */
export async function postPipeline(
  jobUrl: string,
  options?: { submit?: boolean }
): Promise<{ jobId: string }> {
  return request<{ jobId: string }>('/pipeline', {
    method: 'POST',
    body: JSON.stringify({ jobUrl: jobUrl.trim(), submit: options?.submit !== false }),
  });
}

export interface JobListing {
  site: string;
  jobId: string;
  url: string;
  title?: string;
  company?: string;
  location?: string;
  salaryEmploymentType?: string;
  companyLogoUrl?: string;
  applicationSubmitted?: boolean;
  appliedAt?: string;
  /** Job lifecycle state set by the lifecycle system. */
  lifecycleStatus?: 'saved' | 'in_progress' | 'submitted';
  savedAt?: string;
}

export interface JobDetailJob {
  jobId: string;
  site: string;
  title?: string;
  company?: string;
  description?: string;
  url?: string;
  location?: string;
  salaryEmploymentType?: string;
  companyLogoUrl?: string;
  [key: string]: unknown;
}

export interface JobDetailPipeline {
  id: string;
  status: string;
  phase: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  error_code?: string | null;
  retryAllowed?: boolean;
  createdAt: string;
  updatedAt: string;
  userMessage: string | null;
}

export interface JobDetailResponse {
  job: JobDetailJob;
  userState: {
    resumeBasename?: string;
    applicationSubmitted?: boolean;
    appliedAt?: string;
    lifecycleStatus?: 'saved' | 'in_progress' | 'submitted';
    savedAt?: string;
  } | null;
  hasResume: boolean;
  pipelineJob: JobDetailPipeline | null;
}

export async function getJobDetail(jobRef: string): Promise<JobDetailResponse> {
  const params = new URLSearchParams();
  params.set('jobRef', jobRef);
  return request<JobDetailResponse>(`/jobs/detail?${params.toString()}`);
}
export async function postScrapeJobDetail(jobRef: string): Promise<{ job: JobDetailJob }> {
  return request<{ job: JobDetailJob }>("/jobs/scrape", {
    method: 'POST',
    body: JSON.stringify({ jobRef }),
  });
}

export interface FindJobsFilters {
  query?: string;
  location?: string;
  employmentTypes?: string[];
  jobTypes?: string[];
  remoteWork?: string[];
  workAuthorization?: string[];
  page?: number;
  perPage?: number;
  locationFilter?: string;
}

export async function findJobs(options?: {
  site?: string;
  maxResults?: number;
  refresh?: boolean;
  query?: string;
  location?: string;
  employmentTypes?: string[];
  jobTypes?: string[];
  remoteWork?: string[];
  workAuthorization?: string[];
  page?: number;
  perPage?: number;
  locationFilter?: string;
}): Promise<{ listings: JobListing[]; lastRefreshAt?: string | null }> {
  const params = new URLSearchParams();
  if (options?.site) params.set('site', options.site);
  if (options?.maxResults != null) params.set('maxResults', String(options.maxResults));
  if (options?.refresh) params.set('refresh', '1');
  if (options?.query != null && options.query !== '') params.set('query', options.query);
  if (options?.location != null && options.location !== '') params.set('location', options.location);
  (options?.employmentTypes ?? []).forEach((v) => params.append('employmentTypes', v));
  (options?.jobTypes ?? []).forEach((v) => params.append('jobTypes', v));
  (options?.remoteWork ?? []).forEach((v) => params.append('remoteWork', v));
  (options?.workAuthorization ?? []).forEach((v) => params.append('workAuthorization', v));
  if (options?.page != null && options.page >= 1) params.set('page', String(options.page));
  if (options?.perPage != null && options.perPage >= 1) params.set('perPage', String(options.perPage));
  if (options?.locationFilter) params.set('locationFilter', options.locationFilter);
  const qs = params.toString();
  return request<{ listings: JobListing[]; lastRefreshAt?: string | null }>(`/jobs/find${qs ? `?${qs}` : ''}`);
}

export interface SearchJobsResult {
  listings: (JobListing & { ats?: string; greenhouseSlug?: string; departments?: { name: string }[] })[];
  totalCount: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export async function searchJobs(options?: {
  query?: string;
  location?: string;
  company?: string;
  page?: number;
  perPage?: number;
}): Promise<SearchJobsResult> {
  const params = new URLSearchParams();
  if (options?.query) params.set('query', options.query);
  if (options?.location) params.set('location', options.location);
  if (options?.company) params.set('company', options.company);
  if (options?.page != null) params.set('page', String(options.page));
  if (options?.perPage != null) params.set('perPage', String(options.perPage));
  const qs = params.toString();
  console.log({ qs });

  return request<SearchJobsResult>(`/jobs/search${qs ? `?${qs}` : ''}`);
}

export async function hydrateJob(jobRef: string): Promise<{ hydrated: boolean; job: JobDetailJob | null }> {
  return request<{ hydrated: boolean; job: JobDetailJob | null }>('/jobs/hydrate', {
    method: 'POST',
    body: JSON.stringify({ jobRef }),
  });
}

export async function getSubmittedJobList(): Promise<JobListing[]> {
  return request<JobListing[]>('/jobs/submitted-list');
}

/** Save a job to the user's list (sets lifecycle_status = 'saved'). */
export async function saveJob(jobRef: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/jobs/save', {
    method: 'POST',
    body: JSON.stringify({ jobRef }),
  });
}

/** Fetch jobs filtered by lifecycle status. */
export async function getJobLifecycleList(
  status: 'saved' | 'in_progress' | 'submitted'
): Promise<JobListing[]> {
  return request<JobListing[]>(`/jobs/lifecycle-list?status=${encodeURIComponent(status)}`);
}

/** Fetch PDF as blob with auth and trigger download. */
export async function downloadPipelineArtifactPdf(
  jobId: string,
  type: 'resume' | 'cover'
): Promise<void> {
  const path = `/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/${type}?format=pdf`;
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new Error(res.status === 401 ? 'Session expired' : `Download failed: ${res.status}`);
  const blob = await res.blob();
  const name = type === 'resume' ? 'resume.pdf' : 'cover-letter.pdf';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Download PDF of applied resume/cover from snapshot (for jobs that are done). */
export async function downloadAppliedArtifactPdf(
  jobId: string,
  type: 'resume' | 'cover'
): Promise<void> {
  const path = `/pipeline/jobs/${encodeURIComponent(jobId)}/applied-artifacts/${type}?format=pdf`;
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new Error(res.status === 401 ? 'Session expired' : res.status === 404 ? 'No applied document' : `Download failed: ${res.status}`);
  const blob = await res.blob();
  const name = type === 'resume' ? 'resume.pdf' : 'cover-letter.pdf';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type AutomationLevel = 'full' | 'review';

export interface Settings {
  automationLevel: AutomationLevel;
}

export async function getSettings(): Promise<Settings> {
  return request<Settings>('/settings');
}

export async function putSettings(settings: { automationLevel: AutomationLevel }): Promise<Settings> {
  return request<Settings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export interface HandshakeSessionStatus {
  connected: boolean;
  updatedAt: string | null;
  expired: boolean;
}

export async function getHandshakeSessionStatus(): Promise<HandshakeSessionStatus> {
  return request<HandshakeSessionStatus>('/handshake/session/status');
}

export interface Patch {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
  reason?: string;
}

export async function postResumeUpdate(
  resume: Record<string, unknown>,
  instruction: string,
  context?: { jobDescription?: string; editHistory?: string[] },
): Promise<Patch[]> {
  return request<Patch[]>('/ai/resume/update', {
    method: 'POST',
    body: JSON.stringify({ resume, instruction, jobDescription: context?.jobDescription, editHistory: context?.editHistory }),
  });
}

export async function postCoverLetterUpdate(
  text: string,
  instruction: string,
  context?: { jobDescription?: string; editHistory?: string[] },
): Promise<{ text: string }> {
  return request<{ text: string }>('/ai/cover-letter/update', {
    method: 'POST',
    body: JSON.stringify({ text, instruction, jobDescription: context?.jobDescription, editHistory: context?.editHistory }),
  });
}

export async function getArtifactEditHistory(jobId: string, type: 'resume' | 'cover_letter'): Promise<string[]> {
  return request<string[]>(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/${type === 'resume' ? 'resume' : 'cover'}/history`);
}

export async function appendArtifactEditHistory(jobId: string, type: 'resume' | 'cover_letter', entry: string): Promise<void> {
  await request(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/${type === 'resume' ? 'resume' : 'cover'}/history`, {
    method: 'POST',
    body: JSON.stringify({ entry }),
  });
}

// ── Dynamic form API ─────────────────────────────────────────────────────

export async function getApplicationForm(jobRef: string): Promise<{
  classifiedFields: ClassifiedField[];
  answers: GeneratedAnswer[];
  status: string;
} | null> {
  try {
    return await request(`/application-forms/${encodeURIComponent(jobRef)}`);
  } catch {
    return null;
  }
}

export async function putApplicationFormAnswers(
  jobRef: string,
  answers: GeneratedAnswer[],
): Promise<{ ok: boolean }> {
  return request(`/application-forms/${encodeURIComponent(jobRef)}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers }),
  });
}

export async function postApplicationFormReview(
  jobRef: string,
  answers?: GeneratedAnswer[],
): Promise<{ ok: boolean }> {
  return request(`/application-forms/${encodeURIComponent(jobRef)}/review`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export async function postGenerateFieldAnswer(
  jobRef: string,
  fieldId: string,
): Promise<{ fieldId: string; value: string; source: string; confidence: number }> {
  return request(`/application-forms/${encodeURIComponent(jobRef)}/generate-answer`, {
    method: 'POST',
    body: JSON.stringify({ fieldId }),
  });
}

export async function postAiEditFieldAnswer(
  jobRef: string,
  fieldId: string,
  currentValue: string,
  instruction: string,
): Promise<{ fieldId: string; value: string; source: string; confidence: number }> {
  return request(`/application-forms/${encodeURIComponent(jobRef)}/ai-edit`, {
    method: 'POST',
    body: JSON.stringify({ fieldId, currentValue, instruction }),
  });
}

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

export async function getExtendedProfile(): Promise<ExtendedProfileFields> {
  return request('/profile/extended');
}

export async function putExtendedProfile(fields: Partial<ExtendedProfileFields>): Promise<{ ok: boolean }> {
  return request('/profile/extended', {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

// ── Written document API ──────────────────────────────────────────────────

export async function getWrittenDocument(jobId: string): Promise<WrittenDocumentData | null> {
  try {
    return await request(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/written-document`);
  } catch {
    return null;
  }
}

export async function putWrittenDocument(
  jobId: string,
  text: string,
  instructions?: string,
  artifactId?: string,
): Promise<{ ok: boolean }> {
  return request(`/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/written-document`, {
    method: 'PUT',
    body: JSON.stringify({ text, instructions, artifactId }),
  });
}

export async function downloadWrittenDocumentPdf(jobId: string, artifactId: string): Promise<void> {
  const path = `/pipeline/jobs/${encodeURIComponent(jobId)}/artifacts/written-document/${encodeURIComponent(artifactId)}?format=pdf`;
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new Error(res.status === 401 ? 'Session expired' : `Download failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'written-document.pdf';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Subscription / Stripe ──────────────────────────────────────────────────

export type SubscriptionStatus = 'free' | 'pro' | 'cancelled';

export interface SubscriptionStatusResponse {
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  return request<SubscriptionStatusResponse>('/user/subscription-status');
}

export async function createSubscriptionCheckout(): Promise<{ url: string }> {
  return request<{ url: string }>('/subscription/create-checkout', {
    method: 'POST',
  });
}

export async function postSubscriptionPortal(): Promise<{ url: string }> {
  return request<{ url: string }>('/subscription/portal', {
    method: 'POST',
  });
}