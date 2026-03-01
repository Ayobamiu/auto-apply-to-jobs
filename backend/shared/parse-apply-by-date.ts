/**
 * Parse Handshake "Apply by" date string (e.g. "September 29, 2023 at 10:00 PM").
 * Used to detect closed jobs when the deadline is in the past.
 */
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

const FORMATS = [
  'MMMM D, YYYY [at] h:mm A', // September 29, 2023 at 10:00 PM
  'MMM D, YYYY [at] h:mm A',  // Feb 16, 2025 at 11:59 PM
  'MMMM D, YYYY',             // September 29, 2023
  'MMM D, YYYY',
];

/**
 * Parse a date string that matches Handshake's "Apply by" format.
 * @returns dayjs instance if valid, null otherwise.
 */
export function parseApplyByDate(dateStr: string): Dayjs | null {
  for (const fmt of FORMATS) {
    const d = dayjs(dateStr, fmt, true);
    if (d.isValid()) return d;
  }
  return null;
}
