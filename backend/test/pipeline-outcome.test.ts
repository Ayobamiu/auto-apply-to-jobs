import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePipelineOutcome,
  getPipelineOutcomeMessage,
} from '../shared/pipeline-outcome.js';

describe('pipeline-outcome', () => {
  it('normalizePipelineOutcome returns outcome when present', () => {
    assert.equal(normalizePipelineOutcome({ outcome: 'submitted', job: {} }), 'submitted');
    assert.equal(normalizePipelineOutcome({ outcome: 'already_applied', job: {} }), 'already_applied');
    assert.equal(normalizePipelineOutcome({ outcome: 'skipped', job: {} }), 'skipped');
  });

  it('normalizePipelineOutcome derives already_applied from legacy skipped', () => {
    assert.equal(normalizePipelineOutcome({ applied: true, skipped: true, job: {} }), 'already_applied');
  });

  it('normalizePipelineOutcome derives submitted from legacy applied', () => {
    assert.equal(normalizePipelineOutcome({ applied: true, skipped: false, job: {} }), 'submitted');
    assert.equal(normalizePipelineOutcome({ applied: true, job: {} }), 'submitted');
  });

  it('normalizePipelineOutcome derives skipped when applied is false', () => {
    assert.equal(normalizePipelineOutcome({ applied: false, job: {} }), 'skipped');
    assert.equal(normalizePipelineOutcome({ job: {} }), 'skipped');
  });

  it('getPipelineOutcomeMessage returns correct message for each outcome', () => {
    const title = 'Software Engineer';
    assert.ok(getPipelineOutcomeMessage('submitted', title).includes('submitted successfully'));
    assert.ok(getPipelineOutcomeMessage('already_applied', title).includes('already applied'));
    assert.ok(getPipelineOutcomeMessage('skipped', title).includes('not submitted'));
    assert.ok(getPipelineOutcomeMessage('no_apply', title).includes('No apply step'));
  });
});
