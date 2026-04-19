/**
 * Per-user pipeline dispatcher.
 *
 * Ensures that, if no row is currently `running` for the user, the oldest
 * `pending` pipeline row is promoted by calling `runPipelineInBackground`.
 * `awaiting_approval` does NOT block the dispatcher — users get to continue
 * generating the next job's artifacts while they review the previous one.
 *
 * Safe to call concurrently: `runPipelineInBackground` re-checks the row's
 * status under lock and only promotes a `pending` row exactly once.
 */
import { findOldestPendingForUser, hasRunningPipelineJob } from '../data/pipeline-jobs.js';
import { runPipelineInBackground } from './run-pipeline-background.js';

export type DispatchRunner = (jobId: string) => Promise<void>;

/**
 * Promote the oldest `pending` pipeline job to `running` for the given user
 * iff no job is currently `running`. Safe to call concurrently; the second
 * caller is a no-op because the runner guards on `status === 'pending'`.
 *
 * The `runner` parameter exists for testability; production callers pass no
 * argument and the real background runner is used.
 */
export async function dispatchNextForUser(
  userId: string,
  runner: DispatchRunner = (id) => runPipelineInBackground(id),
): Promise<void> {
  try {
    if (await hasRunningPipelineJob(userId)) return;
    const next = await findOldestPendingForUser(userId);
    if (!next) return;
    setImmediate(() => {
      void runner(next.id).catch((err) => {
        console.error(`[dispatcher] runner(${next.id}) threw:`, err);
      });
    });
  } catch (err) {
    console.error('[dispatcher] dispatchNextForUser failed:', err);
  }
}
