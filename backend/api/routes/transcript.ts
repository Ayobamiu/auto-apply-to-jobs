/**
 * POST /users/me/transcript — upload transcript PDF (auth required).
 * Stores in S3 and saves key in user_preferences. Requires S3 env vars.
 */
import type { Request, Response } from 'express';
import multer from 'multer';
import { uploadTranscriptToS3 } from '../../shared/s3-transcript.js';
import { setTranscriptStorageKey } from '../../data/user-preferences.js';

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const transcriptUpload = upload.single('transcript');

export async function getTranscriptStatus(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { hasTranscript } = await import('../../data/user-preferences.js');
  const ok = await hasTranscript(req.userId);
  res.status(200).json({ hasTranscript: ok });
}

export async function postTranscript(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file?.buffer) {
    res.status(400).json({ error: 'No file received. Upload a PDF (field: transcript).' });
    return;
  }

  try {
    const key = await uploadTranscriptToS3(req.userId, file.buffer);
    await setTranscriptStorageKey(req.userId, key);
    res.status(200).json({ ok: true, message: 'Transcript saved.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    const status = message.includes('not configured') ? 503 : 400;
    res.status(status).json({ error: message });
  }
}
