/**
 * Runs the form-fill bot 10 times and logs success/failure for each run.
 * Start the server first: npm start
 * Then run: npm test
 */
import { fillJobApplicationForm } from './fill-form.js';

const RUNS = 10;

async function main() {
  const results = [];

  for (let i = 0; i < RUNS; i++) {
    const run = i + 1;
    try {
      const out = await fillJobApplicationForm({ stopBeforeSubmit: true });
      results.push({ run, success: true, message: out.message });
      console.log(`Run ${run}/${RUNS}: success — ${out.message}`);
    } catch (err) {
      results.push({ run, success: false, message: err.message });
      console.log(`Run ${run}/${RUNS}: failure — ${err.message}`);
    }
  }

  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;
  console.log('\n--- Summary ---');
  console.log(`Total: ${RUNS}, Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
