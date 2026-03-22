# Playwright Form-Filling Bot Demo

A demo that simulates real job-site problems: iframe fields, dynamic fields, placeholder-only labels, validation errors, and random field order. The Playwright bot detects and fills all fields, handles iframes, retries on validation errors, and logs screenshots.

## Setup

```bash
npm install
npx playwright install chromium
```

## Run the form page

Start the local server (keep it running in one terminal):

```bash
npm start
```

Then open http://localhost:8765. The form includes:

- **Step 1:** First name, last name, email (placeholder-only), work authorization dropdown, optional dynamic field (e.g. “Visa type” when Work Visa is selected), and an **iframe** with phone and LinkedIn (placeholder-only). Field order is **random** each load. **Validation errors** appear when required fields are missing.
- **Step 2:** Resume (PDF), agree-to-terms checkbox.

## Run the bot (single run)

In another terminal:

```bash
npm run bot
```

The bot fills all fields (including iframe and any dynamic field), retries when validation errors appear, saves screenshots to `screenshots/`, and **stops before clicking Submit**.

## Run tests (10 successes in a row)

With the server still running:

```bash
npm test
```

Runs the form-fill flow until **10 successful runs in a row**. Any failure resets the counter. Screenshots are written to `screenshots/` (e.g. `run-1-step-1-filled.png`). Exits with code 0 when 10 consecutive runs pass.

## Stage 3 — ATS Dry Run (Handshake)

A fake local Handshake-style page with an **Apply** button that opens a modal: **Attach your transcript**, **Attach your resume**, **Attach your Cover letter** (each with “or Upload new”), then **Submit Application**. Transcript, resume, and cover letter are optional. On submit, the page logs to the console and closes the modal.

With the server running:

- **Single run:** `npm run handshake` — Opens the page, clicks Apply, uploads 3 dummy PDFs, submits, and prints the console log.
- **10× test:** `npm run test:handshake` — Runs the apply flow 10 times; each run must succeed (console log seen). Exits with code 1 on first failure (no crash).

Files: `public/handshake.html` (fake job + modal), `handshake-apply.js` (Playwright script), `test-handshake.js` (10× runner), `fixtures/sample-transcript.pdf`, `fixtures/sample-cover-letter.pdf` (plus existing `sample-resume.pdf`).

## Real Handshake (one job with saved session)

Log in once; session is saved and reused so you don’t re-authenticate every time.

1. **One-time (or when session expires):**  
   `npm run handshake:login`  
   A browser opens at Handshake login. Log in (SSO or password). The script saves the session to `.auth/handshake-state.json` and keeps the browser open; close it when done.

2. **Apply to one job:**  
   `JOB_URL='https://app.joinhandshake.com/...' npm run handshake:apply`  
   or  
   `npm run handshake:apply -- 'https://app.joinhandshake.com/...'`  
   The script loads the saved session, goes to the job URL, clicks Apply, attaches the three fixture PDFs (transcript, resume, cover letter), and **stops before submit** so you can inspect (and submit manually if you want). Browser stays open.

If you haven’t run `handshake:login` yet, `handshake:apply` will tell you to do so. The `.auth/` directory is gitignored (do not commit session files).

**Recording the login flow:** To fix or tune the "logged in" detection, run `npm run handshake:login:record`, then log in in the browser and close the window when you are fully in. Every main-frame navigation is written to `.auth/navigation-log.json` (URL and timestamp). Use that log to see the exact sequence from login page to post-login and update the login script accordingly.

## Beta: one-job flow (quick start)

1. **Setup**

   ```bash
   npm install
   npx playwright install chromium
   cp .env.example .env
   ```

   Edit `.env`: set `OPENAI_API_KEY` if you want LLM resume tailoring (`USE_RESUME_ASSISTANT=1`).

2. **Login once**

   ```bash
   npm run handshake:login
   ```

   Log in in the browser; session is saved to `.auth/`. Close the browser when done.

3. **Put your files in `fixtures/`**  
   At least resume; transcript and cover letter if your school requires them. Default names: `sample-resume.pdf`, `Unofficial Academic Transcript .pdf`, `sample-cover-letter.pdf`. Or set `RESUME_PATH`, `TRANSCRIPT_PATH`, `COVER_PATH` in `.env`.

4. **Fill `shared/profile.json`**  
   Name, email, education, experience, etc. Used for resume generation.

5. **Run pipeline for one job**
   ```bash
   npm run pipeline -- 'https://yourschool.joinhandshake.com/jobs/12345'
   ```
   This scrapes the job, generates a tailored resume PDF, opens the apply modal and attaches files. By default it **stops before submit** so you can review. To submit automatically, set `SUBMIT_APPLICATION=1` in `.env` or run:
   ```bash
   SUBMIT_APPLICATION=1 npm run pipeline -- 'https://yourschool.joinhandshake.com/jobs/12345'
   ```

If Handshake shows a bot-protection or blocking page when scraping, run with a visible browser: set `SCRAPE_HEADED=1` in `.env` or prefix the command: `SCRAPE_HEADED=1 npm run pipeline -- '...'`.

### Commands reference

| Script                   | Description                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `handshake:login`        | One-time login; saves session to `.auth/`                                               |
| `handshake:login:record` | Record navigation during login (for tuning login detection)                             |
| `handshake:apply`        | Apply to one job (session + job URL); stops before submit unless `SUBMIT_APPLICATION=1` |
| `job:scrape`             | Scrape job from URL into `data/jobs.json`                                               |
| `job:status`             | Show application status for a job URL                                                   |
| `resume:generate`        | Generate resume from profile + `shared/job.json` (no URL)                               |
| `resume:edit`            | Edit resume for a job by message (see “Editing a resume” below)                         |
| `pipeline`               | Scrape job (if URL given), generate resume, then run apply when `JOB_URL` set           |

**Env vars that change behavior:** `USER_ID` (user id for multi-user; default is `"default"`), `JOB_URL`, `SUBMIT_APPLICATION` (1 = submit after attach), `SCRAPE_HEADED` (1 = visible browser for scrape), `APPLY_HEADED` (1 = visible browser for apply; default is headless), `BROWSER_ENGINE` (`camoufox` | `chromium` to force), `FORCE_SCRAPE` (1 = re-scrape even if job in store), `RESUME_PATH`, `TRANSCRIPT_PATH`, `COVER_PATH` (override fixture paths), `OPENAI_API_KEY` (for resume assistant / edit), `HANDSHAKE_JOBS_BASE_URL` (school Handshake base). **`PIPELINE_TIMING=1`** — log a phase-by-phase time breakdown. You can also pass **`--user <id>`** before the job URL in pipeline, apply, and other CLIs.

### Pipeline timing (what takes time)

Run with **`PIPELINE_TIMING=1`** to print `[timing]` lines for each phase. Typical time sinks:

| Phase                                            | What it does                                                                                                                                        | Usually slow?                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Step 0: Get job**                              | Scrape job page (or read from store/cache). If scraping: launch browser, load URL, wait for network, expand “More” sections, screenshot, save HTML. | **Yes** — 15–60+ s when scraping (page load + 2s settle + 6s networkidle + expand + screenshot). Skipped if job already in store and not `FORCE_SCRAPE`. |
| **Step 1: Generate resume**                      | Build JSON from profile + job; optionally call LLM (if `USE_RESUME_ASSISTANT=1`).                                                                   | **Can be** — LLM call ~5–30 s. If JSON already exists for this job, step is skipped.                                                                     |
| **Step 1b: Ensure PDF**                          | Generate PDF from JSON via `resumed` (Puppeteer).                                                                                                   | **A few seconds** — only runs when PDF missing or older than JSON.                                                                                       |
| **Apply: session check**                         | Headless browser: load Handshake, 2s settle, check for login redirect.                                                                              | **~5–15 s** — one extra browser launch + navigation.                                                                                                     |
| **Apply: browser launch**                        | Launch visible Chromium, restore auth state, new page.                                                                                              | **1–3 s**.                                                                                                                                               |
| **Apply: goto job page + 2s settle**             | Navigate to job URL, then fixed 2 s wait.                                                                                                           | **3–10 s** (network + 2 s).                                                                                                                              |
| **Apply: click Apply + 1.5s**                    | Click Apply button, then fixed 1.5 s.                                                                                                               | **2–4 s**.                                                                                                                                               |
| **Apply: wait for apply modal**                  | Wait for modal (up to 15 s).                                                                                                                        | **1–5 s**.                                                                                                                                               |
| **Apply: attach transcript + resume + cover**    | Search/upload for each of 3 files.                                                                                                                  | **5–20 s** — depends on search vs upload and network.                                                                                                    |
| **Apply: 6s delay + submit + wait confirmation** | Fixed 6 s delay, click Submit, 2 s, then wait for “Applied on” or “Withdraw” (up to 20 s).                                                          | **~10–30 s** — includes fixed 6 s + 2 s and server response.                                                                                             |

**Summary:** Most of the time is browser work (scrape, session check, apply navigation, and the fixed sleeps: 2s after job page, 1.5s after opening modal, 6s before submit, 2s after submit). To speed up: avoid re-scraping when the job is already in store; skip session check if you’re sure the session is valid (would require a code change); and reduce or make configurable the fixed delays if the site is fast.

### Where data is stored (multi-user)

- `data/profiles.json` — All users’ profiles: `{ [userId]: Profile }`. Default user id is `"default"`.
- `data/apply-state.json` — Per-user, per-job apply state: `{ [userId]: { [jobUrl]: ApplicationState } }`.
- `data/jobs.json` — Canonical job metadata only (site + job ID). No per-user fields.
- `data/user-job-state.json` — Per-user, per-job state: `{ [userId]: { [jobRef]: { resumeBasename?, applicationSubmitted?, appliedAt? } } }`.
- `data/resumes/<userId>/` — Generated resume JSON and PDFs per user.
- `data/apply-forms/` — Apply form schemas per job (global; shared by all users).
- `data/job-cache/` — Cached job HTML (global).
- `output/` — Screenshots (e.g. scrape, apply).
- `.auth/<userId>/` — Saved Handshake session per user (gitignored).

**User id:** Set `USER_ID` in the environment or pass `--user <id>` (e.g. `npm run pipeline -- --user alice 'https://...'`). If omitted, the user id `"default"` is used so existing single-user setups keep working.

**Migration from single-user:** If you had `data/profile.json` or a flat `data/apply-state.json`, the first read will migrate them into `data/profiles.json` and `data/apply-state.json` under the `"default"` key. Move existing `data/resumes/*` into `data/resumes/default/` and `.auth/handshake-state.json` into `.auth/default/handshake-state.json` so the default user keeps using them.

### Editing a resume for a job

To change a tailored resume without regenerating from scratch:

```bash
npm run resume:edit -- handshake <jobId> "Your edit message"
```

Example: `npm run resume:edit -- handshake 10764179 "Add Django to skills"`

The job must already have a resume linked (run the pipeline with that job URL first, or ensure the job exists in `data/jobs.json` with a `resumeBasename` and the corresponding file in `data/resumes/`). Requires `OPENAI_API_KEY` in `.env`. After editing, re-run the pipeline or export PDF if you need an updated PDF.

## Agents and pipeline

The repo is structured for multiple agents (each with a clear input/output):

- **Resume generator** — `data/profile.json` + job (file or from URL) → JSON Resume → PDF in `data/resumes/` (or legacy `output/`).
  - `npm run resume:generate` — uses `shared/job.json`; writes resume JSON and PDF (e.g. in `data/resumes/`). (via [resumed](https://github.com/rbardini/resumed) + theme).
  - **Resume assistant (LLM):** set `USE_RESUME_ASSISTANT=1` and `OPENAI_API_KEY` to use the LLM to tailor the resume to the job; otherwise a direct profile→JSON mapping is used. The assistant is in `assistant.js` (separate from the JSON→PDF step in `export-pdf.js`) so we can add conversational editing later.

- **Job from URL** — Handshake job URL → scrape title, company, description; cache by URL in `data/job-cache/` (24h). Used automatically by the pipeline when `JOB_URL` is set. If the site shows a bot-protection page in headless mode, run with `SCRAPE_HEADED=1` to use a visible browser (e.g. `SCRAPE_HEADED=1 npm run pipeline -- 'https://...'`).

- **Apply state** — Per-job state in `data/apply-state.json` (keyed by job URL). Records when a job has been uploaded (resume path, timestamp). If you run apply again for the same job, uploads are skipped and the modal opens in "ready to submit" mode. On successful submit, `data/jobs.json` is also updated so that job’s `applicationSubmitted` and `appliedAt` stay in sync.

- **Auto-apply (Handshake)** — session + job URL + PDFs → apply flow (stops before submit).
  - `npm run handshake:login` | `handshake:login:record` | `handshake:apply` (see Real Handshake above).
  - Optional env: `RESUME_PATH`, `TRANSCRIPT_PATH`, `COVER_PATH` to override fixture PDFs.
  - First time for a job URL: clears pre-populated files, uploads transcript + resume + cover, then saves state. Next time for same URL: opens modal only (no upload).

- **Pipeline** — get job (from URL scrape/cache or `shared/job.json`), generate resume PDF, then run Handshake apply when `JOB_URL` is set.
  - `npm run pipeline` — job from file; generates resume only (no apply).
  - `npm run pipeline -- 'https://...'` — scrapes/caches job from URL, generates resume from it, then runs apply with that PDF.

## Backend production (Railway / Docker)

Playwright **does not** ship browser binaries with `npm install`. You must download them during the **build** (or bake them into the image). Camoufox (`camoufox-js`) also downloads its own Firefox build to the user cache (`camoufox fetch`).

1. **Dependencies** — `playwright` is listed under `dependencies` in `backend/package.json` so production installs (`npm ci --omit=dev`) still install it.

2. **Build step** — From the `backend/` directory, run after `npm install`:

   ```bash
   npm run install-browsers
   ```

   This runs `playwright install chromium --with-deps` (Chromium + Linux libs, including the headless shell Playwright uses) and `npx camoufox-js fetch` (Camoufox binary from GitHub).

3. **Railway** — Set **Root Directory** to `backend` (or your API folder). Set **Build Command** to something like:

   ```bash
   npm install && npm run install-browsers
   ```

   Set **Start Command** to **`npm run api:start`** (runs `tsx api/server.ts`). **Do not** use `npm run api` in production — that wraps **nodemon**, which watches the filesystem and is prone to **SIGTERM** / restarts on PaaS.

   Ensure the build can reach GitHub (Camoufox release download) and that you **do not** set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in production if you want Camoufox installs/updates (that env is also honored by `camoufox-js` and skips its fetch).

4. **Fallback** — If `--with-deps` fails on your stack (unusual images), use a **Dockerfile** based on `mcr.microsoft.com/playwright` (Ubuntu) and run the same `npm run install-browsers` in the image, or set `PLAYWRIGHT_BROWSERS_PATH` to a path you control and pre-cache browsers there.

5. **Force engine** — `BROWSER_ENGINE=chromium` or `BROWSER_ENGINE=camoufox` in `backend/shared/browser.ts` (see file for behavior).

6. **Job scrape timeouts** — Headless scrapes use a **90s** wall clock by default (`resolveScrapeTimeoutMs` in `backend/shared/constants.ts`). If production hits “Job scrape timed out”, try:
   - **`SCRAPE_TIMEOUT_MS`** — e.g. `180000` (3 minutes) on Railway to allow slow pages / cold starts.
   - **Valid Handshake session** — `getJobFromUrl` loads **`getPathsForUser('default').authState`** only today. On Railway you need **`.auth/default/handshake-state.json`** (or equivalent deploy artifact) so Handshake isn’t a login/bot wall; otherwise Playwright used to sit on long default timeouts and Turndown on huge HTML could burn the rest of the budget.
   - **Resources** — Low CPU/RAM on the host slows Chromium and **Turndown** (description extraction); the scraper now prefers **text** selectors before HTML→markdown and caps HTML size (`MAX_HTML_FOR_TURNDOWN_CHARS`).
   - **Start command** — Use `api:start`, not nodemon (see above); random SIGTERM mid-scrape looks like timeouts.

## Project layout

- `shared/` – Profile and job loaders (`profile.js`, `job.js`, `config.js`), `job-from-url.js` (scrape + cache), `apply-state.js` (per-job state), `json-resume.js` (profile → JSON Resume), sample `profile.json`, `job.json`
- `agents/auto_apply_agent/` – Handshake login, login record, apply-real (session, modal, uploads, state)
- `agents/resume_generator_agent/` – Resume: assistant (LLM) or mapping → JSON; `export-pdf.js` turns JSON → PDF
- `orchestration/run-pipeline.js` – Job from URL or file → resume gen → (optionally) apply
- `public/` – Demo form, iframe form, fake Handshake page
- `fill-form.js`, `handshake-apply.js`, `test-handshake.js` – Demo / fake Handshake (local tests)
- `fixtures/` – Sample PDFs; `data/` – Profile, jobs, apply state, resumes, job cache; `output/` – Screenshots (gitignored)
- `.auth/` – Saved Handshake session (gitignored)
# auto-apply-to-jobs
