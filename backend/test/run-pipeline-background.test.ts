import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDataTables } from '../api/db.js';
import { createPipelineJob, getPipelineJobById } from '../data/pipeline-jobs.js';
import { runPipelineInBackground, type RunPipelineFn } from '../orchestration/run-pipeline-background.js';

async function cleanup() {
  await ensureDataTables();
  await pool.query("DELETE FROM pipeline_jobs WHERE user_id LIKE 'test-%'");
}

describe('runPipelineInBackground', () => {
  before(async () => { await cleanup(); });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('transitions pending -> running -> done on success', async () => {
    const mockResult = { job: { title: 'Test' }, outcome: 'submitted' as const };
    const mockPipeline: RunPipelineFn = async (_url, _opts) => mockResult;

    const { id } = await createPipelineJob('test-user-bg', 'https://example.com/job/bg-1', { submit: false });
    await runPipelineInBackground(id, mockPipeline);

    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'done');
    assert.deepEqual(job!.result, mockResult);
    assert.equal(job!.error, null);
  });

  it('transitions pending -> running -> failed on error', async () => {
    const mockPipeline: RunPipelineFn = async () => { throw new Error('Pipeline exploded'); };

    const { id } = await createPipelineJob('test-user-bg', 'https://example.com/job/bg-2');
    await runPipelineInBackground(id, mockPipeline);

    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'failed');
    assert.equal(job!.error, 'Pipeline exploded');
    assert.equal(job!.result, null);
  });

  it('does nothing if job is not pending', async () => {
    const mockPipeline: RunPipelineFn = async () => { throw new Error('should not run'); };

    const { id } = await createPipelineJob('test-user-bg', 'https://example.com/job/bg-3');
    await pool.query("UPDATE pipeline_jobs SET status = 'running' WHERE id = $1", [id]);

    await runPipelineInBackground(id, mockPipeline);
    const job = await getPipelineJobById(id);
    assert.equal(job!.status, 'running', 'status should remain running');
  });

  it('does nothing for non-existent jobId', async () => {
    const mockPipeline: RunPipelineFn = async () => { throw new Error('should not run'); };
    await assert.doesNotReject(() => runPipelineInBackground('00000000-0000-0000-0000-000000000000', mockPipeline));
  });

  it('passes userId from job row to the pipeline function', async () => {
    let receivedUserId: string | undefined;
    const mockPipeline: RunPipelineFn = async (_url, opts) => {
      receivedUserId = opts?.userId;
      return { job: {} } as ReturnType<RunPipelineFn> extends Promise<infer R> ? R : never;
    };

    const { id } = await createPipelineJob('test-user-bg-uid', 'https://example.com/job/bg-4');
    await runPipelineInBackground(id, mockPipeline);

    assert.equal(receivedUserId, 'test-user-bg-uid');
  });
});
