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
  MISSING_API_KEY: 'MISSING_API_KEY',
};

const DEFAULT_MESSAGES = {
  [CODES.SESSION_EXPIRED]: 'Session expired or not logged in. Run: npm run handshake:login',
  [CODES.NO_SESSION]: 'No saved session. Run: npm run handshake:login',
  [CODES.NO_JOB_URL]: 'Provide job URL: JOB_URL=<url> npm run handshake:apply  OR  npm run handshake:apply -- <url>',
  [CODES.NO_RESUME]: 'No resume for this job. Generate one first (e.g. run pipeline with this job URL).',
  [CODES.APPLY_EXTERNALLY]: 'This job uses "Apply externally" and is not supported. Only in-Handshake apply is supported.',
  [CODES.ALREADY_APPLIED]: 'Already applied to this job.',
  [CODES.JOB_NOT_FOUND]: 'Job not found.',
  [CODES.PREFLIGHT_FAILED]: 'Preflight check failed.',
  [CODES.SCRAPE_TIMEOUT]: 'Job scrape timed out. Try SCRAPE_HEADED=1 or check the page.',
  [CODES.MISSING_API_KEY]: 'OPENAI_API_KEY is required (or pass apiKey in options).',
};

export class AppError extends Error {
  /**
   * @param {string} code - One of CODES
   * @param {string} [message] - Override default message
   */
  constructor(code, message) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code);
    this.name = 'AppError';
    this.code = code;
  }
}

export function isAppError(err) {
  return err && err.name === 'AppError' && err.code;
}

export function messageForCode(code) {
  return DEFAULT_MESSAGES[code] ?? code;
}
