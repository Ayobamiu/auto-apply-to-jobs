import type { Request, Response, NextFunction } from 'express';
import { getUserSubscriptionStatus } from '../db.js';
import { getAutomationLevel } from '../../data/user-preferences.js';

export async function requirePro(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const status = await getUserSubscriptionStatus(userId);
    if (status.subscription_status !== 'pro') {
      res.status(403).json({ error: 'Pro subscription required' });
      return;
    }
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to verify subscription';
    res.status(500).json({ error: message });
  }
}

/**
 * Only gate when the request will actually auto-submit.
 * We treat "auto-submit" as:
 * - POST /pipeline with body.submit === true
 * - AND user's automation_level === 'full'
 */
export async function requireProForAutoSubmit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const bodySubmit = (req.body as { submit?: unknown } | undefined)?.submit === true;
  if (!bodySubmit) {
    next();
    return;
  }

  const automationLevel = await getAutomationLevel(userId);
  if (!shouldRequireProForAutoSubmit(req.body, automationLevel)) {
    // In review mode, pipeline pauses for approval; no auto-submit occurs.
    next();
    return;
  }

  await requirePro(req, res, next);
}

/**
 * Pure predicate to decide whether the request will actually auto-submit.
 * Exported for unit testing.
 */
export function shouldRequireProForAutoSubmit(
  body: unknown,
  automationLevel: 'full' | 'review',
): boolean {
  return (body as { submit?: unknown } | null | undefined)?.submit === true && automationLevel === 'full';
}

