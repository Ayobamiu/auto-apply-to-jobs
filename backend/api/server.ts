/**
 * Express API: auth, pipeline, jobs. JWT-protected routes use req.userId.
 */
import './bootstrap.js';
import express from 'express';
import { authMiddleware } from './middleware/auth.js';
import { register, login } from './routes/auth.js';
import { postPipeline } from './routes/pipeline.js';
import { getJobs, getJobsStatus } from './routes/jobs.js';
import { getProfileHandler, putProfile, postProfileFromResume } from './routes/profile.js';
import { postHandshakeSessionUpload } from './routes/handshake-session.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required in production');
  process.exit(1);
}

const app = express();
app.use(express.json());

// CORS for Chrome extension (and other origins)
// app.use((req, res, next) => {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   if (req.method === 'OPTIONS') {
//     res.sendStatus(204);
//     return;
//   }
//   next();
// });

// Auth (no JWT required)
app.post('/auth/register', register);
app.post('/auth/login', login);

// Protected routes
app.post('/pipeline', authMiddleware, postPipeline);
app.get('/jobs', authMiddleware, getJobs);
app.get('/jobs/status', authMiddleware, getJobsStatus);
app.get('/profile', authMiddleware, getProfileHandler);
app.put('/profile', authMiddleware, putProfile);
app.post('/profile/from-resume', authMiddleware, postProfileFromResume);
app.post('/handshake/session/upload', authMiddleware, postHandshakeSessionUpload);

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
});

const port = Number(process.env.API_PORT || process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
