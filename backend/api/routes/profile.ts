/**
 * GET /profile, PUT /profile, and POST /profile/from-resume (auth required).
 * POST /profile/from-resume accepts JSON { resumeText } or multipart file field "resume" (PDF).
 */
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getProfile, updateProfile } from '../../data/profile.js';
import { getAutomationLevel } from '../../data/user-preferences.js';
import { extractProfileFromResumeText } from '../../shared/profile-from-resume.js';
import { pdfBufferToText } from '../../shared/pdf-to-text.js';
import type { Profile } from '../../shared/types.js';

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

/** Run multer for multipart/form-data only; otherwise next() so JSON body is used. */
export function profileFromResumeUpload(req: Request, res: Response, next: NextFunction): void {
  if (req.is('multipart/form-data')) {
    upload.single('resume')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'File upload failed';
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
    return;
  }
  next();
}

export async function getProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const [profile, automationLevel] = await Promise.all([
      getProfile(req.userId),
      getAutomationLevel(req.userId),
    ]);
    res.status(200).json({ profile, automationLevel });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get profile';
    res.status(500).json({ error: message });
  }
}

export async function putProfile(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = req.body as Partial<Profile>;
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Body must be a JSON object with profile fields' });
    return;
  }

  try {
    await updateProfile(data, req.userId);
    const profile = await getProfile(req.userId);
    res.status(200).json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update profile';
    res.status(500).json({ error: message });
  }
}

export async function postProfileFromResume(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let resumeText: string;
  const file = (req as Request & { file?: { buffer: Buffer; mimetype?: string } }).file;
  if (file?.buffer) {
    try {
      resumeText = await pdfBufferToText(file.buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not extract text from PDF';
      res.status(400).json({ error: message });
      return;
    }
  } else {
    resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
  }

  if (!resumeText) {
    res.status(400).json({
      error: 'Provide either JSON body with resumeText (string) or upload a PDF file (field: resume).',
    });
    return;
  }

  try {
    const profile = await extractProfileFromResumeText(resumeText);
    await updateProfile(profile, req.userId);
    const saved = await getProfile(req.userId);
    res.status(200).json({ profile: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract profile from resume';
    const status =
      message.includes('OPENAI_API_KEY') || message.includes('apiKey') ? 503 : 500;
    res.status(status).json({ error: message });
  }
}
