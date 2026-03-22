/**
 * Structured errors for UI/CLI to branch on. Use codes instead of parsing message strings.
 */
export const CODES = {
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NO_SESSION: 'NO_SESSION',
  NO_JOB_URL: 'NO_JOB_URL',
  NO_RESUME: 'NO_RESUME',
  APPLY_EXTERNALLY: 'APPLY_EXTERNALLY',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  PREFLIGHT_FAILED: 'PREFLIGHT_FAILED',
  SCRAPE_TIMEOUT: 'SCRAPE_TIMEOUT',
  /** Scraped page looks like Handshake login / SSO (no server browser session). */
  SCRAPE_LOGIN_WALL: 'SCRAPE_LOGIN_WALL',
  MISSING_API_KEY: 'MISSING_API_KEY',
  NOT_SUPPORTED_SITE: 'NOT_SUPPORTED_SITE',
} as const;

export type AppErrorCode = (typeof CODES)[keyof typeof CODES];

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  [CODES.SESSION_EXPIRED]: 'Session expired or not logged in. Run: npm run handshake:login',
  [CODES.NO_SESSION]: 'No saved session. Run: npm run handshake:login',
  [CODES.NO_JOB_URL]: 'Provide job URL: JOB_URL=<url> npm run handshake:apply  OR  npm run handshake:apply -- <url>',
  [CODES.NO_RESUME]: 'No resume for this job. Generate one first (e.g. run pipeline with this job URL).',
  [CODES.APPLY_EXTERNALLY]: 'This job uses "Apply externally" and is not supported. Only in-Handshake apply is supported.',
  [CODES.ALREADY_APPLIED]: 'Already applied to this job.',
  [CODES.JOB_NOT_FOUND]: 'Job not found.',
  [CODES.PREFLIGHT_FAILED]: 'Preflight check failed.',
  [CODES.SCRAPE_TIMEOUT]: 'Job scrape timed out. Try SCRAPE_HEADED=1 or check the page.',
  [CODES.SCRAPE_LOGIN_WALL]:
    'Handshake returned a login page instead of the job. Configure a saved browser session on the server (e.g. .auth/default/handshake-state.json).',
  [CODES.MISSING_API_KEY]: 'OPENAI_API_KEY is required (or pass apiKey in options).',
  [CODES.NOT_SUPPORTED_SITE]: 'This job or site is not supported for apply.',
};

/** Codes that mean "do not show Re-apply" in Discover / do not retry. */
export const NON_RETRYABLE_FAILURE_CODES: readonly string[] = [
  CODES.APPLY_EXTERNALLY,
  CODES.JOB_NOT_FOUND,
  CODES.NOT_SUPPORTED_SITE,
] as const;

export function isNonRetryableFailureCode(code: string | null): boolean {
  return code != null && NON_RETRYABLE_FAILURE_CODES.includes(code);
}

export class AppError extends Error {
  code: AppErrorCode;
  constructor(code: AppErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code);
    this.name = 'AppError';
    this.code = code;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError && err.code !== undefined;
}

export function messageForCode(code: AppErrorCode): string {
  return DEFAULT_MESSAGES[code] ?? code;
}
