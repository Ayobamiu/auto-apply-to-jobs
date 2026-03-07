import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNonRetryableFailureCode,
  CODES,
  NON_RETRYABLE_FAILURE_CODES,
} from '../shared/errors.js';

describe('isNonRetryableFailureCode', () => {
  it('returns true for APPLY_EXTERNALLY', () => {
    assert.equal(isNonRetryableFailureCode(CODES.APPLY_EXTERNALLY), true);
  });

  it('returns true for JOB_NOT_FOUND', () => {
    assert.equal(isNonRetryableFailureCode(CODES.JOB_NOT_FOUND), true);
  });

  it('returns true for NOT_SUPPORTED_SITE', () => {
    assert.equal(isNonRetryableFailureCode(CODES.NOT_SUPPORTED_SITE), true);
  });

  it('returns false for null', () => {
    assert.equal(isNonRetryableFailureCode(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(isNonRetryableFailureCode(undefined as unknown as string | null), false);
  });

  it('returns false for retryable codes', () => {
    assert.equal(isNonRetryableFailureCode(CODES.SESSION_EXPIRED), false);
    assert.equal(isNonRetryableFailureCode(CODES.PREFLIGHT_FAILED), false);
  });
});

describe('NON_RETRYABLE_FAILURE_CODES', () => {
  it('includes expected codes', () => {
    assert.ok(NON_RETRYABLE_FAILURE_CODES.includes(CODES.APPLY_EXTERNALLY));
    assert.ok(NON_RETRYABLE_FAILURE_CODES.includes(CODES.JOB_NOT_FOUND));
    assert.ok(NON_RETRYABLE_FAILURE_CODES.includes(CODES.NOT_SUPPORTED_SITE));
  });
});
