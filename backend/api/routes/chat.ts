/**
 * POST /chat — conversational agent endpoint (auth required).
 * Always uses req.userId from JWT; never falls back to 'default'.
 */
import type { Request, Response } from 'express';
import { runOrchestrator, type ChatMessage } from '../../orchestration/chat-orchestrator.js';

export async function postChat(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { message, messages } = req.body ?? {};
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'message is required (non-empty string)' });
    return;
  }

  const history: ChatMessage[] = Array.isArray(messages)
    ? messages
        .filter(
          (m: unknown): m is { role: string; content: string } =>
            m !== null &&
            typeof m === 'object' &&
            typeof (m as Record<string, unknown>).role === 'string' &&
            typeof (m as Record<string, unknown>).content === 'string'
        )
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
    : [];

  try {
    const result = await runOrchestrator(userId, text, history);
    res.status(200).json(result);
  } catch (err) {
    console.error('Chat orchestrator error:', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ reply: 'Something went wrong. Please try again.', error: msg });
  }
}
