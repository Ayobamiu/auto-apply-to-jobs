/**
 * GET /settings, PUT /settings — automation_level (auth required).
 */
import type { Request, Response } from 'express';
import { getAutomationLevel, setAutomationLevel, type AutomationLevel } from '../../data/user-preferences.js';

export async function getSettings(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const automationLevel = await getAutomationLevel(req.userId);
    res.status(200).json({ automationLevel });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get settings';
    res.status(500).json({ error: message });
  }
}

export async function putSettings(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const automationLevel = req.body?.automationLevel;
  if (automationLevel !== 'full' && automationLevel !== 'review') {
    res.status(400).json({ error: 'automationLevel must be "full" or "review"' });
    return;
  }
  try {
    await setAutomationLevel(req.userId, automationLevel as AutomationLevel);
    res.status(200).json({ automationLevel });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update settings';
    res.status(500).json({ error: message });
  }
}
