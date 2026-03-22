import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  isHandshakeAuthWallScrape,
  jobRowHasSubstantialContent,
} from '../shared/scrape-auth-wall.js';

describe('scrape-auth-wall', () => {
  it('detects Handshake login h1', () => {
    assert.equal(
      isHandshakeAuthWallScrape({
        title: 'Sign up or log in',
        company: '',
        description: '',
        applyType: 'none',
      }),
      true,
    );
  });

  it('does not flag normal job titles', () => {
    assert.equal(
      isHandshakeAuthWallScrape({
        title: 'Software Engineer',
        company: 'Acme',
        description: 'x'.repeat(100),
        applyType: 'apply',
      }),
      false,
    );
  });

  it('jobRowHasSubstantialContent uses description length', () => {
    assert.equal(jobRowHasSubstantialContent({ description: 'x'.repeat(80) }), true);
    assert.equal(jobRowHasSubstantialContent({ title: 'x', company: 'y' }), false);
  });
});
