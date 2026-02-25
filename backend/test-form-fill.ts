/**
 * Runs the form-fill bot until 10 successful runs in a row.
 */
import { fillJobApplicationForm } from './fill-form.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_CONSECUTIVE = 10;
const SCREENSHOT_DIR = join(__dirname, 'screenshots');

async function main(): Promise<void> {
  let consecutive = 0;
  let attempt = 0;

  while (consecutive < TARGET_CONSECUTIVE) {
    attempt++;
    try {
      await fillJobApplicationForm({
        stopBeforeSubmit: true,
        screenshotDir: SCREENSHOT_DIR,
        runId: attempt,
      });
      consecutive++;
      console.log(`Attempt ${attempt}: success (${consecutive}/${TARGET_CONSECUTIVE} in a row)`);
    } catch (err) {
      consecutive = 0;
      console.log(`Attempt ${attempt}: failure — ${(err as Error).message}`);
    }
  }

  console.log(`\n--- Done --- ${TARGET_CONSECUTIVE} successful runs in a row (total attempts: ${attempt})`);
  process.exit(0);
}

main();