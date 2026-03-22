/**
 * Centralized constants for the entire backend.
 * Grouped by domain — change values here instead of hunting through files.
 */

// ── Browser & Scraping ──────────────────────────────────────────────

export const SCRAPE_TIMEOUT_HEADLESS_MS = 90_000;
export const SCRAPE_TIMEOUT_HEADED_MS = 120_000;

/**
 * Production: set `SCRAPE_TIMEOUT_MS` (milliseconds, ≥5000, capped at 10 min) on the host
 * when headless scrapes hit the default 90s limit (slow network, cold start, heavy pages).
 */
export function resolveScrapeTimeoutMs(headless: boolean): number {
  const raw = process.env.SCRAPE_TIMEOUT_MS;
  if (raw != null && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 5000) return Math.min(n, 600_000);
  }
  return headless ? SCRAPE_TIMEOUT_HEADLESS_MS : SCRAPE_TIMEOUT_HEADED_MS;
}
export const JOB_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const EXPAND_DESCRIPTION_MAX_CLICKS = 20;

/** Turndown on larger HTML can block the Node event loop for minutes on small hosts; truncate first. */
export const MAX_HTML_FOR_TURNDOWN_CHARS = 200_000;

/** Page.goto timeout for most navigations. */
export const PAGE_GOTO_TIMEOUT_MS = 20_000;
/** waitForLoadState('networkidle') timeout. */
export const NETWORK_IDLE_TIMEOUT_MS = 6_000;

// ── Session ─────────────────────────────────────────────────────────

export const SESSION_CHECK_TIMEOUT_MS = 15_000;
/** Sessions older than this are considered stale in the orchestrator. */
export const SESSION_STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Login ───────────────────────────────────────────────────────────

export const MANUAL_LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── Apply flow ──────────────────────────────────────────────────────

/** Use headed browser for apply (default: headless). Set APPLY_HEADED=1 to debug. */
export const APPLY_HEADED = process.env.APPLY_HEADED === '1' || process.env.APPLY_HEADED === 'true';

export const APPLY_BUTTON_TIMEOUT_MS = 15_000;
export const APPLY_MODAL_TIMEOUT_MS = 15_000;
export const SUBMIT_CONFIRM_TIMEOUT_MS = 20_000;
export const FILE_UPLOAD_TIMEOUT_MS = 10_000;

/** Delay after navigating to the job page before inspecting it. */
export const POST_NAVIGATE_DELAY_MS = 2_000;
/** Delay after clicking the Apply button. */
export const POST_APPLY_CLICK_DELAY_MS = 1_500;
/** Delay before clicking Submit (allows uploads to finalize). */
export const PRE_SUBMIT_DELAY_MS = 6_000;
/** Delay after clicking Submit before checking for confirmation. */
export const POST_SUBMIT_DELAY_MS = 2_000;

/** Max time to wait for all uploads to show green checkmarks before submitting. */
export const UPLOAD_COMPLETE_TIMEOUT_MS = 30_000;
/** How often to poll for upload completion status. */
export const UPLOAD_COMPLETE_POLL_MS = 1_000;
/** Max retries for submit when it fails (e.g. validation error still showing). */
export const SUBMIT_MAX_RETRIES = 3;
/** Delay between submit retries. */
export const SUBMIT_RETRY_DELAY_MS = 5_000;

// ── Attach helper (search / upload) ─────────────────────────────────

export const SEARCH_INPUT_TIMEOUT_MS = 5_000;
export const SEARCH_RESULT_TIMEOUT_MS = 2_000;
export const UPLOAD_NEW_LABEL_TIMEOUT_MS = 3_000;
export const SECTION_DETECT_TIMEOUT_MS = 1_500;

/** Delay after filling the search input to let the dropdown populate. */
export const POST_SEARCH_FILL_DELAY_MS = 800;
/** Delay after clicking "Upload new" before setting the file input. */
export const POST_UPLOAD_CLICK_DELAY_MS = 500;

// ── Resume / Profile ────────────────────────────────────────────────

export const MAX_RESUME_CHARS = 20_000;
/** Max PDF size for resume/transcript uploads (10 MB). */
export const PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;

// ── Server ──────────────────────────────────────────────────────────

export const DEFAULT_API_PORT = 3000;
