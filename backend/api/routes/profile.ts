/**
 * GET /profile, PUT /profile, and POST /profile/from-resume (auth required).
 */
import type { Request, Response } from 'express';
import { getProfile, updateProfile } from '../../data/profile.js';
import { getAutomationLevel } from '../../data/user-preferences.js';
import { extractProfileFromResumeText } from '../../shared/profile-from-resume.js';
import type { Profile } from '../../shared/types.js';

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
