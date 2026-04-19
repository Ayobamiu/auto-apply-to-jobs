import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDataTables } from '../api/db.js';
import {
  createPipelineJob,
  getPipelineJobById,
  updatePipelineJobStatus,
} from '../data/pipeline-jobs.js';
import { dispatchNextForUser } from '../orchestration/dispatch-pending.js';

async function cleanup() {
  await ensureDataTables();
  await pool.query("DELETE FROM pipeline_jobs WHERE user_id LIKE 'test-disp-%'");
}

function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 2000,
): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const val = await fn();
        if (val) return resolve(val);
      } catch (err) {
        return reject(err);
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('timeout'));
      }
      setTimeout(tick, 25);
    };
    void tick();
  });
}

describe('dispatchNextForUser', () => {
  before(async () => { await cleanup(); });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('is a no-op when a running row already exists', async () => {
    const u = 'test-disp-no-op';
    const { id: running } = await createPipelineJob(u, 'https://example.com/job/1');
    await updatePipelineJobStatus(running, 'running');
    const { id: pending } = await createPipelineJob(u, 'https://example.com/job/2');

    let runnerCalls = 0;
    await dispatchNextForUser(u, async () => { runnerCalls += 1; });
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(runnerCalls, 0, 'runner must not be called when a running row exists');
    const p = await getPipelineJobById(pending);
    assert.equal(p!.status, 'pending');
  });

  it('promotes the oldest pending row when nothing is running', async () => {
    const u = 'test-disp-promote';
    const { id: first } = await createPipelineJob(u, 'https://example.com/job/a');
    await new Promise((r) => setTimeout(r, 5));
    await createPipelineJob(u, 'https://example.com/job/b');

    const promoted: string[] = [];
    await dispatchNextForUser(u, async (id) => {
      promoted.push(id);
      await updatePipelineJobStatus(id, 'running');
    });
    await waitFor(async () => (promoted.length > 0 ? true : null), 1000);

    assert.deepEqual(promoted, [first]);
    const row = await getPipelineJobById(first);
    assert.equal(row!.status, 'running');
  });

  it('does nothing when there are no pending rows', async () => {
    const u = 'test-disp-empty';
    let runnerCalls = 0;
    await dispatchNextForUser(u, async () => { runnerCalls += 1; });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(runnerCalls, 0);
  });

  it('is safe to call twice: runner sees status!=pending on the second invocation', async () => {
    const u = 'test-disp-concurrent';
    const { id } = await createPipelineJob(u, 'https://example.com/job/1');

    let runnerCalls = 0;
    const runner = async (jid: string) => {
      runnerCalls += 1;
      const row = await getPipelineJobById(jid);
      if (row?.status === 'pending') {
        await updatePipelineJobStatus(jid, 'running');
      }
    };
    await Promise.all([dispatchNextForUser(u, runner), dispatchNextForUser(u, runner)]);
    await new Promise((r) => setTimeout(r, 80));

    const row = await getPipelineJobById(id);
    assert.equal(row!.status, 'running');
    assert.ok(runnerCalls >= 1, 'runner called at least once');
    assert.ok(runnerCalls <= 2, 'runner called at most twice');
  });
});
