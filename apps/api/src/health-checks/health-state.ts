import { ServiceStatus } from '@prisma/client';

export interface HealthState {
  currentStatus: ServiceStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  successThreshold: number;
}

export interface HealthTransition {
  currentStatus: ServiceStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  /** Set only on the check that crosses a threshold, so incidents open/recover exactly once. */
  event: 'WENT_DOWN' | 'RECOVERED' | null;
}

/**
 * Anti-flapping state machine. A service goes DOWN only after `failureThreshold`
 * consecutive failures and recovers only after `successThreshold` consecutive passes.
 * A single failure on a healthy service marks it DEGRADED without opening an incident.
 */
export function evaluateHealth(state: HealthState, passed: boolean): HealthTransition {
  if (passed) {
    const successes = state.consecutiveSuccesses + 1;
    const recovers = state.currentStatus !== 'HEALTHY' && successes >= state.successThreshold;
    return {
      currentStatus: recovers ? 'HEALTHY' : state.currentStatus,
      consecutiveFailures: 0,
      consecutiveSuccesses: successes,
      event: recovers && state.currentStatus === 'DOWN' ? 'RECOVERED' : null,
    };
  }

  const failures = state.consecutiveFailures + 1;
  if (state.currentStatus !== 'DOWN' && failures >= state.failureThreshold) {
    return { currentStatus: 'DOWN', consecutiveFailures: failures, consecutiveSuccesses: 0, event: 'WENT_DOWN' };
  }
  return {
    currentStatus: state.currentStatus === 'HEALTHY' ? 'DEGRADED' : state.currentStatus,
    consecutiveFailures: failures,
    consecutiveSuccesses: 0,
    event: null,
  };
}
