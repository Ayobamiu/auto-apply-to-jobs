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

| Script | Description |
|--------|-------------|
| `handshake:login` | One-time login; saves session to `.auth/` |
| `handshake:login:record` | Record navigation during login (for tuning login detection) |
| `handshake:apply` | Apply to one job (session + job URL); stops before submit unless `SUBMIT_APPLICATION=1` |
| `job:scrape` | Scrape job from URL into `data/jobs.json` |
| `job:status` | Show application status for a job URL |
| `resume:generate` | Generate resume from profile + `shared/job.json` (no URL) |
| `resume:edit` | Edit resume for a job by message (see “Editing a resume” below) |
| `pipeline` | Scrape job (if URL given), generate resume, then run apply when `JOB_URL` set |

**Env vars that change behavior:** `JOB_URL`, `SUBMIT_APPLICATION` (1 = submit after attach), `SCRAPE_HEADED` (1 = visible browser for scrape), `FORCE_SCRAPE` (1 = re-scrape even if job in store), `RESUME_PATH`, `TRANSCRIPT_PATH`, `COVER_PATH` (override fixture paths), `OPENAI_API_KEY` (for resume assistant / edit), `HANDSHAKE_JOBS_BASE_URL` (school Handshake base).

### Where data is stored

- `data/profile.json` — Your profile (name, email, education, experience, skills).
- `data/jobs.json` — Scraped jobs keyed by site + job ID.
- `data/apply-state.json` — Per-job apply state (resume path, submittedAt).
- `data/resumes/` — Generated resume JSON and PDFs per job.
- `data/apply-forms/` — Captured apply form schemas per job.
- `data/job-cache/` — Cached job HTML by URL.
- `output/` — Screenshots (e.g. scrape, apply); some legacy paths may still write here.
- `.auth/` — Saved Handshake session (gitignored).

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

## Project layout

- `shared/` – Profile and job loaders (`profile.js`, `job.js`, `config.js`), `job-from-url.js` (scrape + cache), `apply-state.js` (per-job state), `json-resume.js` (profile → JSON Resume), sample `profile.json`, `job.json`
- `agents/auto_apply_agent/` – Handshake login, login record, apply-real (session, modal, uploads, state)
- `agents/resume_generator_agent/` – Resume: assistant (LLM) or mapping → JSON; `export-pdf.js` turns JSON → PDF
- `orchestration/run-pipeline.js` – Job from URL or file → resume gen → (optionally) apply
- `public/` – Demo form, iframe form, fake Handshake page
- `fill-form.js`, `handshake-apply.js`, `test-handshake.js` – Demo / fake Handshake (local tests)
- `fixtures/` – Sample PDFs; `data/` – Profile, jobs, apply state, resumes, job cache; `output/` – Screenshots (gitignored)
- `.auth/` – Saved Handshake session (gitignored)
