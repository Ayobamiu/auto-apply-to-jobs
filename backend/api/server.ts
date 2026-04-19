/**
 * Express API: auth, pipeline, jobs. JWT-protected routes use req.userId.
 * Also serves the frontend SPA from frontend/dist when built.
 */
import './bootstrap.js';
import '../jobs/syncGreenhouseJobs.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, '..', '..', 'frontend', 'dist');
import { authMiddleware } from './middleware/auth.js';
import { register, login } from './routes/auth.js';
import { postPipeline } from './routes/pipeline.js';
import { getJobs, getJobsStatus, getJobsDetail, postScrapeJobDetail, getSubmittedJobList, postSaveJob, getJobLifecycleList } from './routes/jobs.js';
import { getJobsFind } from './routes/jobs-find.js';
import { getJobsSearch } from './routes/jobs-search.js';
import { postCreateCheckout, getSubscriptionStatus, postSubscriptionPortal } from './routes/subscription.js';
import { postStripeWebhook } from './routes/stripe-webhook.js';
import { requireProForAutoSubmit } from './middleware/requirePro.js';
import {
  getProfileHandler,
  putProfile,
  postProfileFromResume,
  profileFromResumeUpload,
  getOnboardingStatusHandler,
} from './routes/profile.js';
import { postHandshakeSessionUpload, getHandshakeSessionStatusHandler } from './routes/handshake-session.js';
import {
  getPipelineJobStatus,
  getPipelineJobList,
  getActivePipelineJobsHandler,
  getPipelineJobArtifacts,
  getPipelineJobArtifactsResume,
  getPipelineJobArtifactsCover,
  getPipelineJobArtifactsWrittenDoc,
  putPipelineJobArtifactsResume,
  putPipelineJobArtifactsCover,
  putPipelineJobArtifactsWrittenDoc,
  postPipelineJobApprove,
  postPipelineJobCancel,
  getAppliedArtifactsResume,
  getAppliedArtifactsCover,
  getArtifactEditHistory,
  postArtifactEditHistory,
} from './routes/pipeline-jobs.js';
import { getSettings, putSettings } from './routes/settings.js';
import { postChat, getChatMessages } from './routes/chat.js';
import { transcriptUpload, postTranscript, getTranscriptStatus, getTranscriptPreviewUrl } from './routes/transcript.js';
import {
  userResumeUploadMiddleware,
  getUserResume,
  putUserResume,
  postUserResume,
} from './routes/user-resume.js';
import { postResumeUpdate, postCoverLetterUpdate } from './routes/resume.js';
import {
  getApplicationFormHandler,
  putApplicationFormAnswers,
  postApplicationFormReview,
  postGenerateFieldAnswer,
  postAiEditFieldAnswer,
  getSavedAnswersHandler,
  putSavedAnswerHandler,
  getExtendedProfileHandler,
  putExtendedProfileHandler,
} from './routes/application-forms.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required in production');
  process.exit(1);
}

const app = express();
// Stripe webhooks must receive the raw request body to verify the signature.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), postStripeWebhook);

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
app.post('/pipeline', authMiddleware, requireProForAutoSubmit, postPipeline);
app.post('/jobs/scrape', authMiddleware, postScrapeJobDetail);
app.get('/jobs/detail', authMiddleware, getJobsDetail);
app.get('/jobs', authMiddleware, getJobs);
app.get('/jobs/find', authMiddleware, getJobsFind);
app.get('/jobs/search', authMiddleware, getJobsSearch);
app.get('/jobs/status', authMiddleware, getJobsStatus);
app.get('/jobs/submitted-list', authMiddleware, getSubmittedJobList);
app.post('/jobs/save', authMiddleware, postSaveJob);
app.get('/jobs/lifecycle-list', authMiddleware, getJobLifecycleList);
app.get('/profile', authMiddleware, getProfileHandler);
app.put('/profile', authMiddleware, putProfile);
app.post('/profile/from-resume', authMiddleware, profileFromResumeUpload, postProfileFromResume);
app.get('/pipeline/jobs', authMiddleware, getPipelineJobList);
app.get('/pipeline/jobs/active', authMiddleware, getActivePipelineJobsHandler);
app.get('/pipeline/jobs/:jobId/artifacts/resume', authMiddleware, getPipelineJobArtifactsResume);
app.get('/pipeline/jobs/:jobId/artifacts/cover', authMiddleware, getPipelineJobArtifactsCover);
app.get('/pipeline/jobs/:jobId/artifacts/written-document/:artifactId', authMiddleware, getPipelineJobArtifactsWrittenDoc);
app.get('/pipeline/jobs/:jobId/artifacts', authMiddleware, getPipelineJobArtifacts);
app.put('/pipeline/jobs/:jobId/artifacts/resume', authMiddleware, putPipelineJobArtifactsResume);
app.put('/pipeline/jobs/:jobId/artifacts/cover', authMiddleware, putPipelineJobArtifactsCover);
app.put('/pipeline/jobs/:jobId/artifacts/written-document', authMiddleware, putPipelineJobArtifactsWrittenDoc);
app.post('/pipeline/jobs/:jobId/approve', authMiddleware, postPipelineJobApprove);
app.post('/pipeline/jobs/:jobId/cancel', authMiddleware, postPipelineJobCancel);
app.get('/pipeline/jobs/:jobId/applied-artifacts/resume', authMiddleware, getAppliedArtifactsResume);
app.get('/pipeline/jobs/:jobId/applied-artifacts/cover', authMiddleware, getAppliedArtifactsCover);
app.get('/pipeline/jobs/:jobId', authMiddleware, getPipelineJobStatus);
app.get('/settings', authMiddleware, getSettings);
app.put('/settings', authMiddleware, putSettings);
app.post('/handshake/session/upload', authMiddleware, postHandshakeSessionUpload);
app.get('/handshake/session/status', authMiddleware, getHandshakeSessionStatusHandler);
app.get('/user/onboarding-status', authMiddleware, getOnboardingStatusHandler);
app.get('/users/me/transcript', authMiddleware, getTranscriptStatus);
app.get('/users/me/transcript/preview-url', authMiddleware, getTranscriptPreviewUrl);
app.post('/users/me/transcript', authMiddleware, transcriptUpload, postTranscript);
app.get('/users/me/resume', authMiddleware, getUserResume);
app.put('/users/me/resume', authMiddleware, putUserResume);
app.post('/users/me/resume', authMiddleware, userResumeUploadMiddleware, postUserResume);
app.get('/chat/messages', authMiddleware, getChatMessages);
app.post('/chat', authMiddleware, postChat);
app.post('/ai/resume/update', authMiddleware, postResumeUpdate);
app.post('/ai/cover-letter/update', authMiddleware, postCoverLetterUpdate);
app.get('/pipeline/jobs/:jobId/artifacts/:type/history', authMiddleware, getArtifactEditHistory);
app.post('/pipeline/jobs/:jobId/artifacts/:type/history', authMiddleware, postArtifactEditHistory);

// Dynamic application forms
app.get('/application-forms/:jobRef', authMiddleware, getApplicationFormHandler);
app.put('/application-forms/:jobRef/answers', authMiddleware, putApplicationFormAnswers);
app.post('/application-forms/:jobRef/review', authMiddleware, postApplicationFormReview);
app.post('/application-forms/:jobRef/generate-answer', authMiddleware, postGenerateFieldAnswer);
app.post('/application-forms/:jobRef/ai-edit', authMiddleware, postAiEditFieldAnswer);
app.get('/saved-answers', authMiddleware, getSavedAnswersHandler);
app.put('/saved-answers', authMiddleware, putSavedAnswerHandler);
app.get('/profile/extended', authMiddleware, getExtendedProfileHandler);
app.put('/profile/extended', authMiddleware, putExtendedProfileHandler);

// Subscription billing (Stripe)
app.post('/subscription/create-checkout', authMiddleware, postCreateCheckout);
app.get('/user/subscription-status', authMiddleware, getSubscriptionStatus);
app.post('/subscription/portal', authMiddleware, postSubscriptionPortal);

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
