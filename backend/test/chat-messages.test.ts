import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDataTables } from '../api/db.js';
import { insertMessage, getMessages } from '../data/chat-messages.js';

const TEST_USER = 'test-chat-messages-user';

async function cleanup(): Promise<void> {
  await ensureDataTables();
  await pool.query('DELETE FROM chat_messages WHERE user_id = $1', [TEST_USER]);
}

describe('chat-messages', () => {
  before(cleanup);
  after(cleanup);

  it('insertMessage and getMessages return messages in order with limit', async () => {
    await cleanup();
    await insertMessage(TEST_USER, 'user', 'first');
    await insertMessage(TEST_USER, 'assistant', 'one');
    await insertMessage(TEST_USER, 'user', 'second');
    await insertMessage(TEST_USER, 'assistant', 'two');

    const all = await getMessages(TEST_USER, 10);
    assert.equal(all.length, 4);
    assert.equal(all[0].role, 'user');
    assert.equal(all[0].content, 'first');
    assert.equal(all[1].content, 'one');
    assert.equal(all[2].content, 'second');
    assert.equal(all[3].content, 'two');

    const limited = await getMessages(TEST_USER, 2);
    assert.equal(limited.length, 2);
    assert.equal(limited[0].content, 'second');
    assert.equal(limited[1].content, 'two');
  });

  it('getMessages returns empty array for user with no messages', async () => {
    await cleanup();
    const messages = await getMessages(TEST_USER, 50);
    assert.equal(messages.length, 0);
  });
});
