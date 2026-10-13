import { HealthState, evaluateHealth } from '../../src/health-checks/health-state';

const base: HealthState = {
  currentStatus: 'HEALTHY',
  consecutiveFailures: 0,
  consecutiveSuccesses: 5,
  failureThreshold: 3,
  successThreshold: 2,
};

/** Feeds a sequence of results through the state machine and returns every transition. */
function run(start: HealthState, results: boolean[]) {
  let state = start;
  return results.map((passed) => {
    const next = evaluateHealth(state, passed);
    state = { ...state, ...next };
    return next;
  });
}

describe('evaluateHealth (anti-flapping thresholds)', () => {
  it('a single failure degrades a healthy service without opening an incident', () => {
    const [t] = run(base, [false]);
    expect(t).toEqual({ currentStatus: 'DEGRADED', consecutiveFailures: 1, consecutiveSuccesses: 0, event: null });
  });

  it('goes DOWN exactly on the failure that reaches the threshold', () => {
    const steps = run(base, [false, false, false]);
    expect(steps.map((s) => s.currentStatus)).toEqual(['DEGRADED', 'DEGRADED', 'DOWN']);
    expect(steps.map((s) => s.event)).toEqual([null, null, 'WENT_DOWN']);
  });

  it('keeps failing while DOWN without emitting WENT_DOWN again (no duplicate incidents)', () => {
    const steps = run(base, [false, false, false, false, false]);
    expect(steps.filter((s) => s.event === 'WENT_DOWN')).toHaveLength(1);
    expect(steps[4].consecutiveFailures).toBe(5);
  });

  it('recovers only after successThreshold consecutive passes', () => {
    const down = { ...base, currentStatus: 'DOWN' as const, consecutiveFailures: 3, consecutiveSuccesses: 0 };
    const steps = run(down, [true, true]);
    expect(steps.map((s) => s.currentStatus)).toEqual(['DOWN', 'HEALTHY']);
    expect(steps[1].event).toBe('RECOVERED');
  });

  it('flapping pass/fail never opens an incident and never recovers', () => {
    const steps = run(base, [false, true, false, true, false, true]);
    expect(steps.some((s) => s.event !== null)).toBe(false);
    expect(steps.every((s) => s.currentStatus !== 'DOWN')).toBe(true);
  });

  it('a pass in the middle of failures resets the failure count', () => {
    const steps = run(base, [false, false, true, false, false]);
    expect(steps.some((s) => s.currentStatus === 'DOWN')).toBe(false);
    expect(steps[4].consecutiveFailures).toBe(2);
  });

  it('flapping while DOWN does not recover the service', () => {
    const down = { ...base, currentStatus: 'DOWN' as const, consecutiveFailures: 3, consecutiveSuccesses: 0 };
    const steps = run(down, [true, false, true, false]);
    expect(steps.every((s) => s.currentStatus === 'DOWN')).toBe(true);
  });

  it('a brand-new UNKNOWN service becomes HEALTHY after the success threshold, without a RECOVERED event', () => {
    const fresh = { ...base, currentStatus: 'UNKNOWN' as const, consecutiveSuccesses: 0 };
    const steps = run(fresh, [true, true]);
    expect(steps[1]).toMatchObject({ currentStatus: 'HEALTHY', event: null });
  });

  it('threshold of 1 goes down on the first failure', () => {
    const [t] = run({ ...base, failureThreshold: 1 }, [false]);
    expect(t).toMatchObject({ currentStatus: 'DOWN', event: 'WENT_DOWN' });
  });
});
