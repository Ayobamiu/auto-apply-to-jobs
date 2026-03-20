/**
 * Chat message storage: insert and fetch by user for orchestrator history.
 */
import { pool, ensureDataTables } from '../api/db.js';
import type { ChatMessage } from '../shared/types.js';

export async function insertMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await ensureDataTables();
  await pool.query(
    'INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)',
    [userId, role, content]
  );
}

export async function getMessages(userId: string, limit: number = 50): Promise<ChatMessage[]> {
  await ensureDataTables();
  const capped = Math.min(Math.max(limit, 1), 100);
  const res = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM (
       SELECT role, content, created_at FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) AS t
     ORDER BY created_at ASC`,
    [userId, capped]
  );
  return res.rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));
}
