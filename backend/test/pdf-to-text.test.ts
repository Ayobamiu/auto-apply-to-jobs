import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pdfBufferToText } from '../shared/pdf-to-text.js';
import { PDF_MAX_SIZE_BYTES } from '../shared/constants.js';

describe('pdf-to-text', () => {
  it('rejects empty buffer', async () => {
    await assert.rejects(
      () => pdfBufferToText(Buffer.alloc(0)),
      /PDF buffer is required and must be non-empty/
    );
  });

  it('rejects non-PDF magic bytes', async () => {
    await assert.rejects(
      () => pdfBufferToText(Buffer.from('not a pdf')),
      /does not appear to be a PDF/
    );
  });

  it('rejects buffer over size limit', async () => {
    const big = Buffer.alloc(PDF_MAX_SIZE_BYTES + 1);
    big.write('%PDF', 0);
    await assert.rejects(
      () => pdfBufferToText(big),
      /too large/
    );
  });

  it('extracts text from a valid PDF', async () => {
    const pdfPath = join(process.cwd(), 'data', 'Unofficial Academic Transcript .pdf');
    const buffer = readFileSync(pdfPath);
    const text = await pdfBufferToText(buffer);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 0, 'should return non-empty text from fixture PDF');
  });
});
