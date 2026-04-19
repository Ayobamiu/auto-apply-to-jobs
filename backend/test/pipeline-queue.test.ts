import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDataTables } from '../api/db.js';
import {
  countInFlightByUser,
  findOldestPendingForUser,
  findInFlightByCanonicalUrl,
  hasRunningPipelineJob,
  enqueuePipelineJob,
  listActivePipelineJobs,
  createPipelineJob,
  updatePipelineJobStatus,
  setPipelineJobAwaitingApproval,
  canonicalJobUrlKey,
} from '../data/pipeline-jobs.js';

async function cleanup() {
  await ensureDataTables();
  await pool.query("DELETE FROM pipeline_jobs WHERE user_id LIKE 'test-queue-%'");
}

describe('pipeline-jobs queue helpers', () => {
  before(async () => { await cleanup(); });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('countInFlightByUser only counts pending/running/awaiting_approval', async () => {
    const u = 'test-queue-count-a';
    const { id: a } = await createPipelineJob(u, 'https://example.com/job/1'); // pending
    const { id: b } = await createPipelineJob(u, 'https://example.com/job/2');
    await updatePipelineJobStatus(b, 'running');
    const { id: c } = await createPipelineJob(u, 'https://example.com/job/3');
    await setPipelineJobAwaitingApproval(c, {});
    const { id: d } = await createPipelineJob(u, 'https://example.com/job/4');
    await updatePipelineJobStatus(d, 'done', {});
    const { id: e } = await createPipelineJob(u, 'https://example.com/job/5');
    await updatePipelineJobStatus(e, 'failed', undefined, 'boom');

    const n = await countInFlightByUser(u);
    assert.equal(n, 3);
    void a;
  });

  it('countInFlightByUser ignores stale awaiting_approval rows older than 24h', async () => {
    const u = 'test-queue-count-stale-awaiting';
    const { id: a } = await createPipelineJob(u, 'https://example.com/job/1');
    await setPipelineJobAwaitingApproval(a, {});
    await pool.query(
      `UPDATE pipeline_jobs SET updated_at = now() - interval '25 hours' WHERE id = $1`,
      [a],
    );
    const n = await countInFlightByUser(u);
    assert.equal(n, 0);
  });

  it('findOldestPendingForUser returns oldest pending row', async () => {
    const u = 'test-queue-oldest';
    const { id: a } = await createPipelineJob(u, 'https://example.com/job/1');
    await new Promise((r) => setTimeout(r, 5));
    const { id: b } = await createPipelineJob(u, 'https://example.com/job/2');
    const oldest = await findOldestPendingForUser(u);
    assert.ok(oldest);
    assert.equal(oldest!.id, a);
    void b;
  });

  it('findOldestPendingForUser returns null when none pending', async () => {
    const u = 'test-queue-none';
    const { id } = await createPipelineJob(u, 'https://example.com/job/1');
    await updatePipelineJobStatus(id, 'running');
    const oldest = await findOldestPendingForUser(u);
    assert.equal(oldest, null);
  });

  it('hasRunningPipelineJob detects a running row', async () => {
    const u = 'test-queue-running';
    const { id } = await createPipelineJob(u, 'https://example.com/job/1');
    assert.equal(await hasRunningPipelineJob(u), false);
    await updatePipelineJobStatus(id, 'running');
    assert.equal(await hasRunningPipelineJob(u), true);
  });

  it('findInFlightByCanonicalUrl matches on site:jobId', async () => {
    const u = 'test-queue-canonical';
    const { id } = await createPipelineJob(
      u,
      'https://wmich.joinhandshake.com/job-search/12345',
    );
    const same = await findInFlightByCanonicalUrl(
      u,
      'https://wmich.joinhandshake.com/jobs/12345?ref=x',
    );
    assert.ok(same);
    assert.equal(same!.id, id);
  });

  it('findInFlightByCanonicalUrl ignores stale awaiting_approval duplicates', async () => {
    const u = 'test-queue-canonical-stale';
    const { id } = await createPipelineJob(
      u,
      'https://wmich.joinhandshake.com/job-search/777',
    );
    await setPipelineJobAwaitingApproval(id, {});
    await pool.query(
      `UPDATE pipeline_jobs SET updated_at = now() - interval '25 hours' WHERE id = $1`,
      [id],
    );
    const same = await findInFlightByCanonicalUrl(
      u,
      'https://wmich.joinhandshake.com/jobs/777?ref=x',
    );
    assert.equal(same, null);
  });

  it('canonicalJobUrlKey falls back to URL for unknown sites', () => {
    const k = canonicalJobUrlKey('https://example.com/careers/abc');
    assert.ok(k.startsWith('https://example.com'));
  });

  it('enqueuePipelineJob inserts a new row when under cap', async () => {
    const u = 'test-queue-enqueue-insert';
    const out = await enqueuePipelineJob({
      userId: u,
      jobUrl: 'https://example.com/job/new',
      cap: 3,
      submit: false,
      forceScrape: false,
      automationLevel: 'review',
    });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.reused, false);
      assert.ok(out.jobId);
    }
  });

  it('enqueuePipelineJob reuses existing in-flight row for same canonical URL', async () => {
    const u = 'test-queue-enqueue-reuse';
    const first = await enqueuePipelineJob({
      userId: u,
      jobUrl: 'https://wmich.joinhandshake.com/jobs/999',
      cap: 3,
      submit: false,
      forceScrape: false,
      automationLevel: 'review',
    });
    assert.equal(first.ok, true);
    const second = await enqueuePipelineJob({
      userId: u,
      jobUrl: 'https://wmich.joinhandshake.com/job-search/999',
      cap: 3,
      submit: true,
      forceScrape: true,
      automationLevel: 'full',
    });
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(second.reused, true);
      assert.equal(second.jobId, first.jobId);
    }
  });

  it('enqueuePipelineJob returns queue_full at cap', async () => {
    const u = 'test-queue-enqueue-full';
    for (let i = 0; i < 3; i++) {
      await createPipelineJob(u, `https://example.com/job/${i}`);
    }
    const out = await enqueuePipelineJob({
      userId: u,
      jobUrl: 'https://example.com/job/overflow',
      cap: 3,
      submit: false,
      forceScrape: false,
      automationLevel: 'review',
    });
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.reason, 'queue_full');
      assert.equal(out.inFlight, 3);
      assert.equal(out.cap, 3);
    }
  });

  it('enqueuePipelineJob ignores terminal rows when counting cap', async () => {
    const u = 'test-queue-enqueue-terminal';
    for (let i = 0; i < 3; i++) {
      const { id } = await createPipelineJob(u, `https://example.com/job/${i}`);
      await updatePipelineJobStatus(id, 'done', {});
    }
    const out = await enqueuePipelineJob({
      userId: u,
      jobUrl: 'https://example.com/job/new',
      cap: 3,
      submit: false,
      forceScrape: false,
      automationLevel: 'review',
    });
    assert.equal(out.ok, true);
  });

  it('enqueuePipelineJob ignores stale awaiting_approval rows when counting cap', async () => {
    const u = 'test-queue-enqueue-stale-awaiting';
    for (let i = 0; i < 3; i++) {
      const { id } = await createPipelineJob(u, `https://example.com/job/await-${i}`);
      await setPipelineJobAwaitingApproval(id, {});
      await pool.query(
        `UPDATE pipeline_jobs SET updated_at = now() - interval '25 hours' WHERE id = $1`,
        [id],
      );
    }
    const out = await enqueuePipelineJob({
      userId: u,
      jobUrl: 'https://example.com/job/new',
      cap: 3,
      submit: false,
      forceScrape: false,
      automationLevel: 'review',
    });
    assert.equal(out.ok, true);
  });

  it('listActivePipelineJobs includes in-flight and recent terminals, scrubs big payloads', async () => {
    const u = 'test-queue-active';
    const { id: a } = await createPipelineJob(u, 'https://example.com/job/a');
    const { id: b } = await createPipelineJob(u, 'https://example.com/job/b');
    await updatePipelineJobStatus(b, 'running');
    const { id: c } = await createPipelineJob(u, 'https://example.com/job/c');
    await updatePipelineJobStatus(c, 'done', { huge: 'x'.repeat(10000) });

    const rows = await listActivePipelineJobs(u);
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(a));
    assert.ok(ids.includes(b));
    assert.ok(ids.includes(c));
    for (const row of rows) {
      assert.ok(!('result' in row));
      assert.ok(!('artifacts' in row));
    }
  });

  it('listActivePipelineJobs excludes stale awaiting_approval rows older than 24h', async () => {
    const u = 'test-queue-active-stale-awaiting';
    const { id } = await createPipelineJob(u, 'https://example.com/job/stale-awaiting');
    await setPipelineJobAwaitingApproval(id, {});
    await pool.query(
      `UPDATE pipeline_jobs SET updated_at = now() - interval '25 hours' WHERE id = $1`,
      [id],
    );
    const rows = await listActivePipelineJobs(u);
    const ids = rows.map((r) => r.id);
    assert.equal(ids.includes(id), false);
  });

  it('listActivePipelineJobs excludes other users', async () => {
    const u1 = 'test-queue-active-u1';
    const u2 = 'test-queue-active-u2';
    await createPipelineJob(u1, 'https://example.com/job/u1');
    await createPipelineJob(u2, 'https://example.com/job/u2');
    const rows = await listActivePipelineJobs(u1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].job_url, 'https://example.com/job/u1');
  });
});
