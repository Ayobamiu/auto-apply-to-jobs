/**
 * POST /chat — conversational agent endpoint (auth required).
 * History is loaded from DB; each turn is persisted after success.
 */
import type { Request, Response } from 'express';
import { getMessages, insertMessage } from '../../data/chat-messages.js';
import { runOrchestrator, type ChatMessage } from '../../orchestration/chat-orchestrator.js';

export async function postChat(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { message } = req.body ?? {};
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'message is required (non-empty string)' });
    return;
  }

  const history: ChatMessage[] = await getMessages(userId, 50);

  try {
    const result = await runOrchestrator(userId, text, history);
    await insertMessage(userId, 'user', text);
    await insertMessage(userId, 'assistant', result.reply);
    res.status(200).json(result);
  } catch (err) {
    console.error('Chat orchestrator error:', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ reply: 'Something went wrong. Please try again.', error: msg });
  }
}

/**
 * GET /chat/messages — return last N messages for the authenticated user (auth required).
 */
export async function getChatMessages(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const messages = await getMessages(userId, limit);
  res.status(200).json({ messages });
}
