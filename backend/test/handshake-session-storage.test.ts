import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolvePlaywrightStorageStateForUser } from '../data/handshake-session.js';

describe('resolvePlaywrightStorageStateForUser', () => {
  it('returns empty object when useAuth is false', async () => {
    const opts = await resolvePlaywrightStorageStateForUser('any-user-id', false);
    assert.deepStrictEqual(opts, {});
  });
});
