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

## Agents and pipeline

The repo is structured for multiple agents (each with a clear input/output):

- **Resume generator** — `shared/profile.json` + `shared/job.json` → tailored resume (Markdown) in `output/`.  
  - `npm run resume:generate` — writes `output/resume-<job-slug>.md`.

- **Auto-apply (Handshake)** — session + job URL + PDFs → apply flow (stops before submit).  
  - `npm run handshake:login` | `handshake:login:record` | `handshake:apply` (see Real Handshake above).  
  - Optional env: `RESUME_PATH`, `TRANSCRIPT_PATH`, `COVER_PATH` to override fixture PDFs.

- **Pipeline** — generate resume, then run apply when `JOB_URL` is set.  
  - `npm run pipeline` — generate from profile + job; if `JOB_URL` or first arg is set, runs Handshake apply.  
  - `npm run pipeline -- 'https://...'` — generate then apply to that URL.

## Project layout

- `shared/` – Profile and job loaders (`profile.js`, `job.js`, `config.js`), sample `profile.json`, `job.json`
- `agents/auto_apply_agent/` – Handshake login, login record, apply-real (session, modal, uploads)
- `agents/resume_generator_agent/` – Resume from profile + job → `output/resume-*.md`
- `orchestration/run-pipeline.js` – Runs resume gen then (optionally) apply
- `public/` – Demo form, iframe form, fake Handshake page
- `fill-form.js`, `handshake-apply.js`, `test-handshake.js` – Demo / fake Handshake (local tests)
- `fixtures/` – Sample PDFs; `output/` – Generated resumes (gitignored)
- `.auth/` – Saved Handshake session (gitignored)
