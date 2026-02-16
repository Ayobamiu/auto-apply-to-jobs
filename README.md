# Playwright Form-Filling Bot Demo

A small demo to test a Playwright bot that fills a multi-step job application form.

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

Then open http://localhost:8765 in a browser to see the form.

## Run the bot (single run)

In another terminal:

```bash
npm run bot
```

The bot fills all fields, uploads `fixtures/sample-resume.pdf`, goes to step 2, and **stops before clicking Submit**.

## Run tests (10 runs)

With the server still running:

```bash
npm test
```

Runs the form-fill flow 10 times and logs success/failure for each run, then prints a summary. Exits with code 1 if any run failed.

## Project layout

- `public/index.html` – Job application form (plain HTML, multi-step)
- `server.js` – Static file server
- `fill-form.js` – Playwright script (exported `fillJobApplicationForm()`)
- `test-form-fill.js` – Test runner (10 runs, logs results)
- `fixtures/sample-resume.pdf` – Minimal PDF used for resume upload
