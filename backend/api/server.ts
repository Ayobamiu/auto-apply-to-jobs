/**
 * Express API: auth, pipeline, jobs. JWT-protected routes use req.userId.
 * Also serves the frontend SPA from frontend/dist when built.
 */
import './bootstrap.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, '..', '..', 'frontend', 'dist');
import { authMiddleware } from './middleware/auth.js';
import { register, login } from './routes/auth.js';
import { postPipeline } from './routes/pipeline.js';
import { getJobs, getJobsStatus } from './routes/jobs.js';
import {
  getProfileHandler,
  putProfile,
  postProfileFromResume,
  profileFromResumeUpload,
} from './routes/profile.js';
import { postHandshakeSessionUpload, getHandshakeSessionStatusHandler } from './routes/handshake-session.js';
import {
  getPipelineJobStatus,
  getPipelineJobList,
  getPipelineJobArtifacts,
  getPipelineJobArtifactsResume,
  getPipelineJobArtifactsCover,
  putPipelineJobArtifactsResume,
  putPipelineJobArtifactsCover,
  postPipelineJobApprove,
  postPipelineJobCancel,
  getAppliedArtifactsResume,
  getAppliedArtifactsCover,
} from './routes/pipeline-jobs.js';
import { getSettings, putSettings } from './routes/settings.js';
import { postChat, getChatMessages } from './routes/chat.js';
import { transcriptUpload, postTranscript, getTranscriptStatus } from './routes/transcript.js';
import {
  userResumeUploadMiddleware,
  getUserResume,
  putUserResume,
  postUserResume,
} from './routes/user-resume.js';
import { postResumeUpdate } from './routes/resume.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required in production');
  process.exit(1);
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Auth (no JWT required)
app.post('/auth/register', register);
app.post('/auth/login', login);

// Protected routes
app.post('/pipeline', authMiddleware, postPipeline);
app.get('/jobs', authMiddleware, getJobs);
app.get('/jobs/status', authMiddleware, getJobsStatus);
app.get('/profile', authMiddleware, getProfileHandler);
app.put('/profile', authMiddleware, putProfile);
app.post('/profile/from-resume', authMiddleware, profileFromResumeUpload, postProfileFromResume);
app.get('/pipeline/jobs', authMiddleware, getPipelineJobList);
app.get('/pipeline/jobs/:jobId/artifacts/resume', authMiddleware, getPipelineJobArtifactsResume);
app.get('/pipeline/jobs/:jobId/artifacts/cover', authMiddleware, getPipelineJobArtifactsCover);
app.get('/pipeline/jobs/:jobId/artifacts', authMiddleware, getPipelineJobArtifacts);
app.put('/pipeline/jobs/:jobId/artifacts/resume', authMiddleware, putPipelineJobArtifactsResume);
app.put('/pipeline/jobs/:jobId/artifacts/cover', authMiddleware, putPipelineJobArtifactsCover);
app.post('/pipeline/jobs/:jobId/approve', authMiddleware, postPipelineJobApprove);
app.post('/pipeline/jobs/:jobId/cancel', authMiddleware, postPipelineJobCancel);
app.get('/pipeline/jobs/:jobId/applied-artifacts/resume', authMiddleware, getAppliedArtifactsResume);
app.get('/pipeline/jobs/:jobId/applied-artifacts/cover', authMiddleware, getAppliedArtifactsCover);
app.get('/pipeline/jobs/:jobId', authMiddleware, getPipelineJobStatus);
app.get('/settings', authMiddleware, getSettings);
app.put('/settings', authMiddleware, putSettings);
app.post('/handshake/session/upload', authMiddleware, postHandshakeSessionUpload);
app.get('/handshake/session/status', authMiddleware, getHandshakeSessionStatusHandler);
app.get('/users/me/transcript', authMiddleware, getTranscriptStatus);
app.post('/users/me/transcript', authMiddleware, transcriptUpload, postTranscript);
app.get('/users/me/resume', authMiddleware, getUserResume);
app.put('/users/me/resume', authMiddleware, putUserResume);
app.post('/users/me/resume', authMiddleware, userResumeUploadMiddleware, postUserResume);
app.get('/chat/messages', authMiddleware, getChatMessages);
app.post('/chat', authMiddleware, postChat);
app.post('/ai/resume/update', authMiddleware, postResumeUpdate);

// Serve frontend SPA (after API routes so API paths take priority)
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.use((_req, res, next) => {
    if (_req.method === 'GET' && _req.accepts('html')) {
      res.sendFile(join(FRONTEND_DIST, 'index.html'));
    } else {
      next();
    }
  });
}

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.API_PORT || process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}
