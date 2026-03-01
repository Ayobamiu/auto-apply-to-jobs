/**
 * S3-backed transcript storage: upload PDF and download to temp file for apply.
 * When S3 env vars are not set, upload fails with a clear error; resolution falls back to TRANSCRIPT_PATH.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream } from 'fs';
import { mkdtemp, unlink } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { PDF_MAX_SIZE_BYTES } from './constants.js';

const PDF_MAGIC = Buffer.from('%PDF');

function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === PDF_MAGIC[0] && buffer[1] === PDF_MAGIC[1] && buffer[2] === PDF_MAGIC[2] && buffer[3] === PDF_MAGIC[3];
}

function getS3Client(): S3Client | null {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  if (!bucket?.trim()) return null;
  return new S3Client({
    region,
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
}

/** Upload transcript PDF to S3; key is users/{userId}/transcript.pdf. Returns the key. */
export async function uploadTranscriptToS3(userId: string, buffer: Buffer): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET?.trim();
  if (!client || !bucket) {
    throw new Error('S3 is not configured. Set S3_BUCKET, AWS_REGION, and optional AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Transcript file is required and must be non-empty.');
  }
  if (!isPdfBuffer(buffer)) {
    throw new Error('File does not appear to be a PDF (missing %PDF header).');
  }
  if (buffer.length > PDF_MAX_SIZE_BYTES) {
    throw new Error(`PDF is too large (max ${PDF_MAX_SIZE_BYTES / 1024 / 1024} MB).`);
  }

  const key = `users/${encodeURIComponent(userId)}/transcript.pdf`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    })
  );
  return key;
}

/** Download transcript from S3 to a temp file. Returns the path. Caller may delete the file after use. */
export async function downloadTranscriptFromS3ToTemp(storageKey: string): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.S3_BUCKET?.trim();
  if (!client || !bucket) {
    throw new Error('S3 is not configured. Cannot download transcript.');
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    })
  );
  if (!response.Body) {
    throw new Error('Empty transcript object in S3.');
  }

  const dir = await mkdtemp(join(tmpdir(), 'transcript-'));
  const path = join(dir, 'transcript.pdf');
  const dest = createWriteStream(path);
  await pipeline(response.Body as NodeJS.ReadableStream, dest);
  return path;
}

/** Schedule deletion of a temp file after a short delay (e.g. after apply). */
export function scheduleTempFileCleanup(filePath: string, delayMs: number = 60_000): void {
  setTimeout(() => {
    unlink(filePath).catch(() => {});
  }, delayMs);
}
