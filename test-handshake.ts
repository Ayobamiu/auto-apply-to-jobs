/**
 * ATS Dry Run — Handshake: run apply flow 10 times (stops before submit). No crash = pass.
 */
import { runHandshakeApply } from './handshake-apply.js';

const RUNS = 10;

async function main(): Promise<void> {
  for (let i = 0; i < RUNS; i++) {
    const run = i + 1;
    try {
      const result = await runHandshakeApply({ stopBeforeSubmit: true, keepOpen: true });
      console.log(`Run ${run}/${RUNS}: success — ${result.log ?? result.message}`);
    } catch (err) {
      console.error(`Run ${run}/${RUNS}: failure — ${(err as Error).message}`);
      process.exit(1);
    }
  }
  console.log(`\n--- Done --- ${RUNS} runs completed without crash.`);
  process.exit(0);
}

main();