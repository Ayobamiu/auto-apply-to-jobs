import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { pool, ensureDataTables } from '../api/db.js';
import { createPipelineJob, updatePipelineJobStatus } from '../data/pipeline-jobs.js';

process.env.NODE_ENV = 'test';

const { app } = await import('../api/server.js');

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
}

const userA = { id: 'test-api-user-a', token: '' };
const userB = { id: 'test-api-user-b', token: '' };

async function cleanup() {
  await ensureDataTables();
  await pool.query("DELETE FROM pipeline_jobs WHERE user_id LIKE 'test-api-%'");
}

describe('POST /pipeline (async)', () => {
  before(async () => {
    userA.token = makeToken(userA.id);
    userB.token = makeToken(userB.id);
    await cleanup();
  });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('returns 202 with jobId for valid request', async () => {
    const res = await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ jobUrl: 'https://example.com/job/api-1' });

    assert.equal(res.status, 202);
    assert.ok(res.body.jobId, 'should have jobId');
    assert.match(res.body.jobId, /^[0-9a-f-]{36}$/);
    assert.ok(res.body.message);
  });

  it('creates a pending pipeline_jobs row', async () => {
    const res = await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ jobUrl: 'https://example.com/job/api-2', submit: true });

    const row = await pool.query('SELECT * FROM pipeline_jobs WHERE id = $1', [res.body.jobId]);
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].user_id, userA.id);
    assert.equal(row.rows[0].status, 'pending');
    assert.equal(row.rows[0].submit, true);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app)
      .post('/pipeline')
      .send({ jobUrl: 'https://example.com/job/api-3' });

    assert.equal(res.status, 401);
  });

  it('returns 400 without jobUrl', async () => {
    const res = await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({});

    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 with empty jobUrl', async () => {
    const res = await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ jobUrl: '   ' });

    assert.equal(res.status, 400);
  });
});

describe('GET /pipeline/jobs/:jobId', () => {
  before(async () => {
    userA.token = makeToken(userA.id);
    userB.token = makeToken(userB.id);
    await cleanup();
  });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('returns 200 with job status for owner', async () => {
    const post = await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ jobUrl: 'https://example.com/job/get-1' });

    const res = await supertest(app)
      .get(`/pipeline/jobs/${post.body.jobId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.jobUrl, 'https://example.com/job/get-1');
    assert.ok(['pending', 'running', 'done', 'failed'].includes(res.body.status));
  });

  it('returns 404 for wrong user (no data leak)', async () => {
    const post = await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ jobUrl: 'https://example.com/job/get-2' });

    const res = await supertest(app)
      .get(`/pipeline/jobs/${post.body.jobId}`)
      .set('Authorization', `Bearer ${userB.token}`);

    assert.equal(res.status, 404);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app)
      .get('/pipeline/jobs/00000000-0000-0000-0000-000000000000');

    assert.equal(res.status, 401);
  });

  it('returns 404 for non-existent jobId', async () => {
    const res = await supertest(app)
      .get('/pipeline/jobs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${userA.token}`);

    assert.equal(res.status, 404);
  });

  it('includes error_code and retryAllowed when job is failed with error_code', async () => {
    const { id: jobId } = await createPipelineJob(userA.id, 'https://example.com/job/err-code');
    await updatePipelineJobStatus(jobId, 'failed', undefined, 'Apply externally', 'APPLY_EXTERNALLY');

    const res = await supertest(app)
      .get(`/pipeline/jobs/${jobId}`)
      .set('Authorization', `Bearer ${userA.token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'failed');
    assert.equal(res.body.error_code, 'APPLY_EXTERNALLY');
    assert.equal(res.body.retryAllowed, false);
  });
});

describe('CORS', () => {
  it('OPTIONS to /pipeline returns 204 with CORS headers', async () => {
    const res = await supertest(app)
      .options('/pipeline')
      .set('Origin', 'http://localhost:5173');

    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.ok(res.headers['access-control-allow-methods']?.includes('POST'));
    assert.ok(res.headers['access-control-allow-headers']?.includes('Authorization'));
  });
});

describe('GET /pipeline/jobs (list)', () => {
  before(async () => {
    userA.token = makeToken(userA.id);
    userB.token = makeToken(userB.id);
    await cleanup();
  });
  after(async () => { await cleanup(); });
  beforeEach(async () => { await cleanup(); });

  it('returns only jobs for the authenticated user', async () => {
    await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ jobUrl: 'https://example.com/job/list-a' });

    await supertest(app)
      .post('/pipeline')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ jobUrl: 'https://example.com/job/list-b' });

    const res = await supertest(app)
      .get('/pipeline/jobs')
      .set('Authorization', `Bearer ${userA.token}`);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].jobUrl, 'https://example.com/job/list-a');
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).get('/pipeline/jobs');
    assert.equal(res.status, 401);
  });
});
