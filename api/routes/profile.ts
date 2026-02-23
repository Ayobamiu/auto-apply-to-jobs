/**
 * GET /profile and POST /profile/from-resume (auth required).
 */
import type { Request, Response } from 'express';
import { getProfile } from '../../data/profile.js';
import { extractProfileFromResumeText } from '../../shared/profile-from-resume.js';

export async function getProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const profile = await getProfile(req.userId);
    res.status(200).json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get profile';
    res.status(500).json({ error: message });
  }
}

export async function postProfileFromResume(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const resumeText =
    typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
  if (!resumeText) {
    res.status(400).json({ error: 'Body must include resumeText (non-empty string)' });
    return;
  }

  try {
    const profile = await extractProfileFromResumeText(resumeText);
    res.status(200).json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract profile from resume';
    const status =
      message.includes('OPENAI_API_KEY') || message.includes('apiKey') ? 503 : 500;
    res.status(status).json({ error: message });
  }
}
