/**
 * Explicit pipeline apply outcomes. Use these instead of overlapping applied/skipped booleans
 * to prevent miscommunication between pipeline result and user-facing messages.
 */
export const PIPELINE_APPLY_OUTCOMES = ['submitted', 'already_applied', 'skipped', 'no_apply'] as const;
export type PipelineApplyOutcome = (typeof PIPELINE_APPLY_OUTCOMES)[number];

export interface PipelineResultWithOutcome {
  job: { title?: string;[key: string]: unknown };
  resumePath?: string;
  outcome: PipelineApplyOutcome;
}

/**
 * Derive outcome from legacy result (applied/skipped) for backward compatibility.
 */
export function normalizePipelineOutcome(result: Record<string, unknown> | null): PipelineApplyOutcome | null {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.outcome === 'string' && PIPELINE_APPLY_OUTCOMES.includes(result.outcome as PipelineApplyOutcome)) {
    return result.outcome as PipelineApplyOutcome;
  }
  const skipped = result.skipped === true;
  const applied = result.applied === true;
  if (skipped) return 'already_applied';
  if (applied) return 'submitted';
  if (result.job) return 'skipped';
  return 'no_apply';
}

/**
 * Single source of truth: map outcome to user-facing message.
 */
export function getPipelineOutcomeMessage(
  outcome: PipelineApplyOutcome,
  jobTitle: string
): string {
  switch (outcome) {
    case 'submitted':
      return `Done! Your application to "${jobTitle}" has been submitted successfully.`;
    case 'already_applied':
      return `You've already applied to "${jobTitle}". No new application was submitted.`;
    case 'skipped':
      return `The pipeline finished for "${jobTitle}". Resume was generated but the application was not submitted (submit was not enabled or the job was skipped).`;
    case 'no_apply':
      return `Pipeline completed for "${jobTitle}". No apply step was run.`;
    default: {
      const _: never = outcome;
      return `Pipeline completed for "${jobTitle}".`;
    }
  }
}
