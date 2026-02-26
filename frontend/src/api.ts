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

export interface PipelineJobStatus {
  status: string;
  phase: string | null;
  jobUrl?: string;
  submit?: boolean;
  result?: unknown;
  error?: string | null;
  /** User-facing message when status is 'done' (single source of truth from backend) */
  userMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function getPipelineJobStatus(jobId: string): Promise<PipelineJobStatus> {
  return request<PipelineJobStatus>(`/pipeline/jobs/${encodeURIComponent(jobId)}`);
}

export interface HandshakeSessionStatus {
  connected: boolean;
  updatedAt: string | null;
}

export async function getHandshakeSessionStatus(): Promise<HandshakeSessionStatus> {
  return request<HandshakeSessionStatus>('/handshake/session/status');
}
