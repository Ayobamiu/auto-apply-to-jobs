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

## Project layout

- `public/index.html` – Multi-step job form (iframe, dynamic fields, random order, validation errors)
- `public/iframe-form.html` – Iframe content (phone, LinkedIn; placeholder-only)
- `server.js` – Static file server
- `fill-form.js` – Playwright bot (iframe, retry, screenshots, dynamic fields)
- `test-form-fill.js` – Test runner (10 consecutive successes)
- `fixtures/sample-resume.pdf` – Sample PDF for resume upload
- `screenshots/` – Screenshots per step (gitignored)
