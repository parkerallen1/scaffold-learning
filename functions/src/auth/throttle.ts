export const AUTH_THROTTLE_POLICY = Object.freeze({
  windowMs: 15 * 60 * 1000,
  maxAttemptsPerWindow: 20,
  failuresBeforeLockout: 5,
  lockoutMs: 5 * 60 * 1000,
});

export type AuthThrottleState = Readonly<{
  windowStartedAtMs: number;
  attemptsInWindow: number;
  consecutiveFailures: number;
  lockedUntilMs: number;
  updatedAtMs: number;
}>;

export type AttemptReservation = Readonly<{
  allowed: boolean;
  state: AuthThrottleState;
}>;

export const createThrottleState = (nowMs: number): AuthThrottleState =>
  Object.freeze({
    windowStartedAtMs: nowMs,
    attemptsInWindow: 0,
    consecutiveFailures: 0,
    lockedUntilMs: 0,
    updatedAtMs: nowMs,
  });

const resetExpiredWindow = (state: AuthThrottleState, nowMs: number): AuthThrottleState =>
  nowMs - state.windowStartedAtMs >= AUTH_THROTTLE_POLICY.windowMs
    ? createThrottleState(nowMs)
    : state;

export const reserveAuthAttempt = (
  current: AuthThrottleState,
  nowMs: number,
): AttemptReservation => {
  const state = resetExpiredWindow(current, nowMs);

  if (state.lockedUntilMs > nowMs) {
    return Object.freeze({
      allowed: false,
      state: Object.freeze({ ...state, updatedAtMs: nowMs }),
    });
  }

  if (state.attemptsInWindow >= AUTH_THROTTLE_POLICY.maxAttemptsPerWindow) {
    return Object.freeze({
      allowed: false,
      state: Object.freeze({
        ...state,
        lockedUntilMs: nowMs + AUTH_THROTTLE_POLICY.lockoutMs,
        updatedAtMs: nowMs,
      }),
    });
  }

  return Object.freeze({
    allowed: true,
    state: Object.freeze({
      ...state,
      attemptsInWindow: state.attemptsInWindow + 1,
      updatedAtMs: nowMs,
    }),
  });
};

export const recordAuthOutcome = (
  current: AuthThrottleState,
  succeeded: boolean,
  nowMs: number,
): AuthThrottleState => {
  const state = resetExpiredWindow(current, nowMs);
  if (succeeded) {
    return Object.freeze({
      ...state,
      consecutiveFailures: 0,
      lockedUntilMs: 0,
      updatedAtMs: nowMs,
    });
  }

  const consecutiveFailures = state.consecutiveFailures + 1;
  return Object.freeze({
    ...state,
    consecutiveFailures,
    lockedUntilMs:
      consecutiveFailures >= AUTH_THROTTLE_POLICY.failuresBeforeLockout
        ? Math.max(state.lockedUntilMs, nowMs + AUTH_THROTTLE_POLICY.lockoutMs)
        : state.lockedUntilMs,
    updatedAtMs: nowMs,
  });
};
