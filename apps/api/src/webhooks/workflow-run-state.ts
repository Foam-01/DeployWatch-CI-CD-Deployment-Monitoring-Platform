import { WorkflowConclusion, WorkflowStatus } from '@prisma/client';

const STATUS_RANK: Record<WorkflowStatus, number> = {
  QUEUED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

export function mapWorkflowStatus(status: string | undefined): WorkflowStatus {
  switch (status) {
    case 'in_progress':
      return 'IN_PROGRESS';
    case 'completed':
      return 'COMPLETED';
    default:
      // queued, waiting, requested, pending
      return 'QUEUED';
  }
}

export function mapWorkflowConclusion(conclusion: string | null | undefined): WorkflowConclusion | null {
  if (!conclusion) return null;
  const map: Record<string, WorkflowConclusion> = {
    success: 'SUCCESS',
    failure: 'FAILURE',
    cancelled: 'CANCELLED',
    skipped: 'SKIPPED',
    timed_out: 'TIMED_OUT',
    action_required: 'ACTION_REQUIRED',
    // GitHub-only outcomes without a dedicated enum value
    neutral: 'SUCCESS',
    stale: 'CANCELLED',
    startup_failure: 'FAILURE',
  };
  return map[conclusion] ?? 'FAILURE';
}

/**
 * GitHub can deliver workflow_run events late or out of order. A run only moves
 * forward (QUEUED → IN_PROGRESS → COMPLETED); an older event must never roll back
 * a newer status. Returns true when `incoming` should be applied over `current`.
 */
export function shouldApplyStatus(current: WorkflowStatus, incoming: WorkflowStatus): boolean {
  return STATUS_RANK[incoming] > STATUS_RANK[current];
}
