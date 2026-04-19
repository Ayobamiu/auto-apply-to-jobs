# Pipeline Queue — Phase 1

**Goal.** Let a user queue up to **3 in-flight pipeline jobs** via the existing single-URL paste flow, while the server runs **at most 1 pipeline at a time per user**. Model B: if the running pipeline reaches `awaiting_approval`, the next `pending` job immediately starts (review time = idle server time).

**Non-goals (Phase 2+).** Multi-URL chip input. SSE push updates. Browser notifications. Retry button. Cross-tab coordination. Prev/next review navigation.

---

## Invariants

- `count(running) <= 1` per user at any time.
- `count(in-flight) <= 3` per user, where `in-flight = pending | running | awaiting_approval`.
- Submitting the same canonical URL while it is in-flight returns the existing `jobId` (idempotent).

---

## Backend

### Data / dispatcher

- [x] **B1.** `countInFlightByUser(userId)` added to `backend/data/pipeline-jobs.ts`.
- [x] **B2.** `findOldestPendingForUser(userId)` added.
- [x] **B3.** `findInFlightByCanonicalUrl(userId, jobUrl)` + `canonicalJobUrlKey(url)` helper added.
- [x] **B4.** `backend/orchestration/dispatch-pending.ts` → `dispatchNextForUser(userId, runner?)`. Runner is injectable for tests; defaults to the real `runPipelineInBackground`.

### Wire the dispatcher

- [x] **B5.** `postPipeline` now calls `dispatchNextForUser` after enqueue.
- [x] **B6.** `runPipelineInBackground` calls `dispatchNextForUser(user_id)` on every terminal branch (`paused/awaiting_approval`, `done`, `failed`, `cancelled`).
- [x] **B7.** `resumePipelineAfterApproval` calls `dispatchNextForUser(user_id)` on every terminal branch. `postPipelineJobCancel` (cancel endpoint) also kicks the dispatcher so queued jobs aren't stranded.

### Cap & idempotency at POST

- [x] **B8.** `enqueuePipelineJob(...)` in the data layer performs the check + insert inside a single transaction under a per-user advisory lock (`pg_advisory_xact_lock(hashtext('pipeline:<userId>'))`), so two concurrent POSTs can never both slip under the cap (E1 satisfied).
  - Duplicate canonical URL → reuse existing row (`{ reused: true, jobId }`), HTTP 200.
  - Cap reached → HTTP 409 `{ error: "QUEUE_FULL", inFlightCount, cap }`.

### Active-jobs API

- [x] **B9.** `GET /pipeline/jobs/active` registered in `server.ts` (above `/pipeline/jobs/:jobId` so route precedence is correct).
- [x] **B10.** `listActivePipelineJobs(userId, recentTerminalMinutes = 15)` returns the slim projection; `result` and `artifacts` are scrubbed before they leave the server.

### Tests

- [x] **B11.** `backend/test/dispatch-pending.test.ts` covers: no-op when running exists, promotes oldest pending, safe under concurrent calls, no-op when empty. Uses an injectable `runner` so tests don't spin up real Playwright.
- [x] **B12.** `backend/test/api-pipeline.test.ts` adds: duplicate in-flight URL returns existing jobId with `reused: true`, cap → 409 `QUEUE_FULL`.
- [x] **B13.** `backend/test/api-pipeline.test.ts` adds a `GET /pipeline/jobs/active` test suite covering user isolation, auth, and payload scrubbing.

---

## Frontend

### API client

- [x] **F1.** `getActivePipelineJobs()` added to `frontend/src/api.ts` (returns `{ jobs, cap, inFlightCount }`).
- [x] **F2.** `postPipeline()` returns `{ jobId, reused, inFlightCount }` and throws a typed `QueueFullError` on HTTP 409 `QUEUE_FULL`.

### Shared hook + store

- [x] **F3.** `frontend/src/hooks/usePipelineQueue.tsx`:
  - Polls every 4 s, pauses while `document.hidden`, single-flight via an in-flight ref, refreshes immediately on tab focus.
  - Exposes `{ jobs, inFlightCount, cap, hasAwaitingApproval, loaded, refresh, cancel, dismiss, addOptimistic, removeOptimistic }`.
  - Provider pattern (`PipelineQueueProvider` + `usePipelineQueue`, plus `useOptionalPipelineQueue`) so consumers share a single poller.

### Tray

- [x] **F4.** `frontend/src/components/PipelineTray.tsx`:
  - Floating panel bottom-right; auto-hidden when the list is empty.
  - Per-row status icon + phase label + contextual actions (Review / Open / Cancel) + dismiss × for terminal rows.
  - Header shows `inFlightCount / cap` plus a "Review ready" pill when any awaiting-approval row exists.
- [x] **F5.** Mounted at the app root in `App.tsx` inside the `PipelineQueueProvider`, only when `isLoggedIn_`.

### Submission (single-URL, cap-aware)

- [x] **F6.** `HandshakeLinkModal` (the primary paste surface):
  - Reads the queue via `useOptionalPipelineQueue`.
  - Disables submit + shows "Queue full" banner + tooltip when `inFlightCount >= cap`.
  - Catches `QueueFullError` as a safety net and shows the same copy.
  - On `reused: true`, jumps straight to the job detail page instead of polling again.
- [x] **F7.** Tray lives bottom-right (above the mobile bottom nav); paste modal is a centered modal; no layout collision.

### Visual tie-in with existing Discover/Detail

- [x] **F8.** Tray "Review" / "Open" link to `/discover/job/:jobRef` (derived from `site` + numeric job id in the stored URL). Existing review/approve/cancel flows remain untouched.

### Tests

- [ ] **F9.** Unit test for tray state reducer — deferred; the tray is a thin view over the hook and all business logic lives in `usePipelineQueue`, which is covered by manual QA (F10). Happy to add `@testing-library/react` tests in a follow-up if we want codified coverage.
- [ ] **F10.** Manual QA checklist (no e2e yet):
  1. Paste 1 URL, tray shows it, progresses through phases, applies.
  2. Paste URL A → wait until `running`. Paste URL B. Confirm: B is `pending` while A is `running`.
  3. When A transitions to `awaiting_approval`, confirm B flips to `running` within one poll cycle.
  4. Paste URL C while A is awaiting_approval and B is running. Confirm: C is `pending`. `inFlightCount = 3`.
  5. Paste URL D. Confirm submit is blocked with "Queue full".
  6. Cancel C from tray. Confirm D can now be pasted.
  7. Paste same URL twice; confirm second paste returns the existing jobId and tray doesn't duplicate.
  8. Approve A. Apply step runs (B may still be running). When A is done and B is awaiting_approval, both visible in tray, inFlightCount is 2.

---

## Edge cases to handle explicitly

- [x] **E1.** Two near-simultaneous POSTs — solved by wrapping cap-check + INSERT in a single transaction guarded by `pg_advisory_xact_lock(hashtext('pipeline:<userId>'))`. A second POST blocks behind the first, so the cap is exact.
- [x] **E2.** Cancel a `pending` row: the cancel endpoint updates status and calls `dispatchNextForUser` so any later pending is still considered — though in practice nothing was running so nothing new needs to start.
- [x] **E3.** Cancel a `running` row: `runPipelineInBackground`'s `JOB_CANCELLED_ERROR` branch now dispatches the next pending on its way out. `postPipelineJobCancel` also calls the dispatcher for good measure.
- [ ] **E4.** Server restart with `running` rows left over: out of scope for v1. TODO: add a boot-time sweep that flips orphaned `running` rows to `failed` with a helpful error.
- [x] **E5.** User signs out mid-pipeline: backend pipelines keep running. The tray is only mounted when logged in, and it repopulates on the next poll after sign-in.

---

## Out of scope (track separately)

- Multi-URL chip input.
- `/pipeline/batch`.
- Retry endpoint & button.
- SSE / `LISTEN/NOTIFY`.
- Browser Notifications API.
- Review fan-out prev/next on detail page.
- Global (cross-user) concurrency cap.

---

## Ship criteria

- All `B*` and `F*` tasks checked.
- Manual QA list (F10) passes.
- `npm run typecheck` (backend) clean. `npm run build` (frontend) clean.
- Existing single-URL flow continues to work end-to-end unchanged.
