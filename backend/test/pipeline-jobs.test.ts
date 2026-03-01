import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDataTables } from '../api/db.js';
import {
  createPipelineJob,
  getPipelineJob,
  getPipelineJobById,
  updatePipelineJobStatus,
  cancelPipelineJob,
} from '../data/pipeline-jobs.js';

async function cleanup() {
  await ensureDataTables();
  await pool.query("DELETE FROM pipeline_jobs WHERE user_id LIKE 'test-%'");
}

describe('pipeline-jobs data layer', () => {
  before(async () => { await cleanup(); });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('createPipelineJob inserts a row and returns an id', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/1', { submit: true, forceScrape: false });
    assert.ok(id, 'should return an id');
    assert.match(id, /^[0-9a-f-]{36}$/, 'id should be a UUID');
  });

  it('getPipelineJobById returns the job without user check', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/2');
    const job = await getPipelineJobById(id);
    assert.ok(job, 'job should exist');
    assert.equal(job!.user_id, 'test-user-a');
    assert.equal(job!.job_url, 'https://example.com/job/2');
    assert.equal(job!.status, 'pending');
    assert.equal(job!.submit, false);
    assert.equal(job!.force_scrape, false);
    assert.equal(job!.result, null);
    assert.equal(job!.error, null);
  });

  it('getPipelineJob returns null for wrong userId', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/3');
    const job = await getPipelineJob(id, 'test-user-b');
    assert.equal(job, null, 'should not return job for wrong user');
  });

  it('getPipelineJob returns the job for correct userId', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/4');
    const job = await getPipelineJob(id, 'test-user-a');
    assert.ok(job, 'should return the job');
    assert.equal(job!.id, id);
  });

  it('getPipelineJob returns null for non-existent jobId', async () => {
    const job = await getPipelineJob('00000000-0000-0000-0000-000000000000', 'test-user-a');
    assert.equal(job, null);
  });

  it('updatePipelineJobStatus updates status to running', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/5');
    await updatePipelineJobStatus(id, 'running');
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'running');
  });

  it('updatePipelineJobStatus transitions to done with result', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/6');
    await updatePipelineJobStatus(id, 'running');
    const result = { job: { title: 'Test' }, outcome: 'submitted' };
    await updatePipelineJobStatus(id, 'done', result);
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'done');
    assert.deepEqual(job!.result, result);
    assert.equal(job!.error, null);
  });

  it('updatePipelineJobStatus transitions to failed with error', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/7');
    await updatePipelineJobStatus(id, 'running');
    await updatePipelineJobStatus(id, 'failed', undefined, 'Pipeline exploded');
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'failed');
    assert.equal(job!.error, 'Pipeline exploded');
    assert.equal(job!.result, null);
  });

  it('cancelPipelineJob returns true and sets status to cancelled when job is pending', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/8');
    const ok = await cancelPipelineJob(id, 'test-user-a');
    assert.equal(ok, true);
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'cancelled');
  });

  it('cancelPipelineJob returns true when job is running', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/9');
    await updatePipelineJobStatus(id, 'running');
    const ok = await cancelPipelineJob(id, 'test-user-a');
    assert.equal(ok, true);
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'cancelled');
  });

  it('cancelPipelineJob returns false for wrong user', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/10');
    const ok = await cancelPipelineJob(id, 'test-user-b');
    assert.equal(ok, false);
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'pending');
  });

  it('cancelPipelineJob returns false when job is already done', async () => {
    const { id } = await createPipelineJob('test-user-a', 'https://example.com/job/11');
    await updatePipelineJobStatus(id, 'done', {});
    const ok = await cancelPipelineJob(id, 'test-user-a');
    assert.equal(ok, false);
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'done');
  });
});
