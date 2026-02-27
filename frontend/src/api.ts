const API_BASE = '';

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

export interface PipelineArtifacts {
  resume: Record<string, unknown> | null;
  cover: { text: string } | null;
  jobTitle: string;
  /** Sections the job requires; used to show only resume and/or cover in review UI. */
  requiredSections?: string[];
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
}

export async function getHandshakeSessionStatus(): Promise<HandshakeSessionStatus> {
  return request<HandshakeSessionStatus>('/handshake/session/status');
}
