/**
 * Simple timing for pipeline/apply phases. Enable with PIPELINE_TIMING=1.
 */
const enabled = process.env.PIPELINE_TIMING === '1' || process.env.PIPELINE_TIMING === 'true';

export function startPhase(label: string): () => void {
  if (!enabled) return () => { };
  const start = performance.now();
  return () => {
    const ms = Math.round(performance.now() - start);
    console.log(`[timing] ${label}: ${ms}ms`);
  };
}

export function isTimingEnabled(): boolean {
  return enabled;
}

/** Call at start of pipeline; returns function to call at end to log total. */
export function startTotal(label: string): () => void {
  if (!enabled) return () => { };
  const start = performance.now();
  return () => {
    const ms = Math.round(performance.now() - start);
    console.log(`[timing] TOTAL ${label}: ${ms}ms`);
  };
}
