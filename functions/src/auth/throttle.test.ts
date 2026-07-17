import { describe, expect, it } from 'vitest';

import {
  AUTH_THROTTLE_POLICY,
  createThrottleState,
  recordAuthOutcome,
  reserveAuthAttempt,
} from './throttle.js';

describe('student authentication throttle', () => {
  it('atomically reserves a bounded number of attempts per window', () => {
    let state = createThrottleState(1_000);
    for (let attempt = 0; attempt < AUTH_THROTTLE_POLICY.maxAttemptsPerWindow; attempt += 1) {
      const reservation = reserveAuthAttempt(state, 1_000 + attempt);
      expect(reservation.allowed).toBe(true);
      state = reservation.state;
    }

    const blocked = reserveAuthAttempt(state, 2_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.state.lockedUntilMs).toBeGreaterThan(2_000);
  });

  it('locks after consecutive failures and clears the failure count on success', () => {
    let state = createThrottleState(10_000);
    for (let failure = 0; failure < AUTH_THROTTLE_POLICY.failuresBeforeLockout; failure += 1) {
      state = recordAuthOutcome(state, false, 10_000 + failure);
    }

    expect(state.lockedUntilMs).toBeGreaterThan(10_000);
    state = recordAuthOutcome(state, true, 11_000);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lockedUntilMs).toBe(0);
  });

  it('starts a clean throttle window after expiry', () => {
    const exhausted = {
      ...createThrottleState(0),
      attemptsInWindow: AUTH_THROTTLE_POLICY.maxAttemptsPerWindow,
      consecutiveFailures: AUTH_THROTTLE_POLICY.failuresBeforeLockout,
      lockedUntilMs: 1,
    };
    const reservation = reserveAuthAttempt(exhausted, AUTH_THROTTLE_POLICY.windowMs + 1);

    expect(reservation.allowed).toBe(true);
    expect(reservation.state.attemptsInWindow).toBe(1);
    expect(reservation.state.consecutiveFailures).toBe(0);
  });
});
