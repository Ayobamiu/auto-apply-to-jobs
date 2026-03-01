/**
 * Extract plain text from a PDF buffer for use with extractProfileFromResumeText or similar.
 * Validates magic bytes and size before parsing.
 */
import { PDFParse } from 'pdf-parse';
import { PDF_MAX_SIZE_BYTES } from './constants.js';

const PDF_MAGIC = Buffer.from('%PDF');

function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === PDF_MAGIC[0] && buffer[1] === PDF_MAGIC[1] && buffer[2] === PDF_MAGIC[2] && buffer[3] === PDF_MAGIC[3];
}

/**
 * Extract text from a PDF buffer. Validates %PDF magic bytes and enforces size limit.
 * @param buffer - Raw PDF bytes
 * @returns Extracted plain text
 * @throws Error if not a PDF, over size limit, or parsing fails
 */
export async function pdfBufferToText(buffer: Buffer): Promise<string> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('PDF buffer is required and must be non-empty.');
  }
  if (!isPdfBuffer(buffer)) {
    throw new Error('File does not appear to be a PDF (missing %PDF header).');
  }
  if (buffer.length > PDF_MAX_SIZE_BYTES) {
    throw new Error(
      `PDF is too large (max ${PDF_MAX_SIZE_BYTES / 1024 / 1024} MB).`
    );
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result?.text ?? '';
    await parser.destroy();
    if (typeof text !== 'string') return String(text);
    return text.trim() || '';
  } catch (err) {
    await parser.destroy().catch(() => {});
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Could not extract text from PDF: ${msg}`);
  }
}
