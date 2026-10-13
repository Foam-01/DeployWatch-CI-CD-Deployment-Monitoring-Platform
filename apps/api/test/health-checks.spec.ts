describe('Synthetic Health Check & Anti-Flapping Threshold Engine', () => {
  interface ServiceState {
    status: 'HEALTHY' | 'DOWN' | 'UNKNOWN';
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    failureThreshold: number;
    successThreshold: number;
  }

  function evaluateProbe(
    current: ServiceState,
    probeSuccess: boolean,
  ): { nextState: ServiceState; triggerIncident: boolean; resolveIncident: boolean } {
    let nextFailures = probeSuccess ? 0 : current.consecutiveFailures + 1;
    let nextSuccesses = probeSuccess ? current.consecutiveSuccesses + 1 : 0;
    let nextStatus = current.status;
    let triggerIncident = false;
    let resolveIncident = false;

    if (!probeSuccess && nextFailures >= current.failureThreshold && current.status !== 'DOWN') {
      nextStatus = 'DOWN';
      triggerIncident = true;
    } else if (probeSuccess && nextSuccesses >= current.successThreshold && current.status === 'DOWN') {
      nextStatus = 'HEALTHY';
      resolveIncident = true;
    }

    return {
      nextState: {
        ...current,
        status: nextStatus,
        consecutiveFailures: nextFailures,
        consecutiveSuccesses: nextSuccesses,
      },
      triggerIncident,
      resolveIncident,
    };
  }

  it('should ignore single isolated failure without triggering incident (anti-flapping)', () => {
    const initial: ServiceState = {
      status: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 5,
      failureThreshold: 3,
      successThreshold: 2,
    };

    const step1 = evaluateProbe(initial, false);
    expect(step1.nextState.status).toBe('HEALTHY');
    expect(step1.nextState.consecutiveFailures).toBe(1);
    expect(step1.triggerIncident).toBe(false);

    // If next probe succeeds, failures reset to 0
    const step2 = evaluateProbe(step1.nextState, true);
    expect(step2.nextState.status).toBe('HEALTHY');
    expect(step2.nextState.consecutiveFailures).toBe(0);
    expect(step2.triggerIncident).toBe(false);
  });

  it('should trigger incident only after reaching failure threshold (e.g. 3 consecutive failures)', () => {
    let state: ServiceState = {
      status: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      failureThreshold: 3,
      successThreshold: 2,
    };

    // Failure 1
    state = evaluateProbe(state, false).nextState;
    expect(state.status).toBe('HEALTHY');

    // Failure 2
    state = evaluateProbe(state, false).nextState;
    expect(state.status).toBe('HEALTHY');

    // Failure 3 -> Threshold reached!
    const res = evaluateProbe(state, false);
    expect(res.nextState.status).toBe('DOWN');
    expect(res.triggerIncident).toBe(true);
  });

  it('should require 2 consecutive successes to resolve sustained outage', () => {
    let state: ServiceState = {
      status: 'DOWN',
      consecutiveFailures: 4,
      consecutiveSuccesses: 0,
      failureThreshold: 3,
      successThreshold: 2,
    };

    // First recovery ping
    const res1 = evaluateProbe(state, true);
    expect(res1.nextState.status).toBe('DOWN'); // Still down! Needs 2 successes
    expect(res1.resolveIncident).toBe(false);

    // Second recovery ping
    const res2 = evaluateProbe(res1.nextState, true);
    expect(res2.nextState.status).toBe('HEALTHY'); // Now healthy!
    expect(res2.resolveIncident).toBe(true);
  });
});
