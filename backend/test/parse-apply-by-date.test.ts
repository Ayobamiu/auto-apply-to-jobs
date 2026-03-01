import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import { parseApplyByDate } from '../shared/parse-apply-by-date.js';

describe('parse-apply-by-date', () => {
  it('parses "September 29, 2023 at 10:00 PM" and returns expected date', () => {
    const result = parseApplyByDate('September 29, 2023 at 10:00 PM');
    assert.ok(result !== null);
    assert.ok(result!.isValid());
    assert.equal(result!.year(), 2023);
    assert.equal(result!.month(), 8);
    assert.equal(result!.date(), 29);
    assert.ok(result!.isBefore(dayjs()));
  });

  it('parses "Feb 16, 2025 at 11:59 PM"', () => {
    const result = parseApplyByDate('Feb 16, 2025 at 11:59 PM');
    assert.ok(result !== null);
    assert.ok(result!.isValid());
    assert.equal(result!.year(), 2025);
    assert.equal(result!.month(), 1);
    assert.equal(result!.date(), 16);
  });

  it('parses date-only "September 29, 2023"', () => {
    const result = parseApplyByDate('September 29, 2023');
    assert.ok(result !== null);
    assert.ok(result!.isValid());
    assert.equal(result!.year(), 2023);
    assert.equal(result!.date(), 29);
  });

  it('returns null for invalid string', () => {
    const result = parseApplyByDate('not a date');
    assert.equal(result, null);
  });
});
