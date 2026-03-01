import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectIntentFromLLM } from '../shared/intent-from-llm.js';

describe('intent-from-llm', () => {
  it('returns check_status when LLM returns valid check_status JSON', async () => {
    const result = await detectIntentFromLLM('what is the status?', {
      mockResponse: JSON.stringify({ intent: 'check_status', url: null }),
    });
    assert.equal(result.intent, 'check_status');
    assert.equal(result.url, null);
  });

  it('returns apply with url when LLM returns apply and a URL', async () => {
    const url = 'https://wmich.joinhandshake.com/jobs/12345';
    const result = await detectIntentFromLLM('apply to this job ' + url, {
      mockResponse: JSON.stringify({ intent: 'apply', url }),
    });
    assert.equal(result.intent, 'apply');
    assert.equal(result.url, url);
  });

  it('returns help when LLM returns invalid JSON', async () => {
    const result = await detectIntentFromLLM('hello', {
      mockResponse: 'not json at all',
    });
    assert.equal(result.intent, 'help');
    assert.equal(result.url, null);
  });

  it('returns help when LLM returns unknown intent', async () => {
    const result = await detectIntentFromLLM('foo', {
      mockResponse: JSON.stringify({ intent: 'unknown_intent', url: null }),
    });
    assert.equal(result.intent, 'help');
    assert.equal(result.url, null);
  });

  it('returns help when mockResponse is empty', async () => {
    const result = await detectIntentFromLLM('hi', {
      mockResponse: '',
    });
    assert.equal(result.intent, 'help');
    assert.equal(result.url, null);
  });

  it('normalizes intent to lowercase', async () => {
    const result = await detectIntentFromLLM('list jobs', {
      mockResponse: JSON.stringify({ intent: 'LIST_JOBS', url: null }),
    });
    assert.equal(result.intent, 'list_jobs');
  });
});
