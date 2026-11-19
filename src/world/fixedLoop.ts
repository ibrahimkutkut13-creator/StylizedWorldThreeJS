export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.05;
export const MAX_SUB_STEPS = 4;

export interface FixedLoopConfig {
  fixedStep?: number;
  maxFrameDelta?: number;
  maxSubSteps?: number;
}

export interface FixedLoopState {
  accumulator: number;
  elapsed: number;
  stepCount: number;
}

export interface FixedLoopTickResult {
  clampedDt: number;
  stepsExecuted: number;
  alpha: number;
}

export function createFixedLoopState(): FixedLoopState {
  return {
    accumulator: 0,
    elapsed: 0,
    stepCount: 0,
  };
}

export function advanceFixedLoop(
  state: FixedLoopState,
  rawDt: number,
  onFixedStep: (dt: number, elapsed: number) => void,
  config: FixedLoopConfig = {},
): FixedLoopTickResult {
  const fixedStep = config.fixedStep ?? FIXED_STEP;
  const maxFrameDelta = config.maxFrameDelta ?? MAX_FRAME_DELTA;
  const maxSubSteps = config.maxSubSteps ?? MAX_SUB_STEPS;

  const safeDt = Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 0;
  const clampedDt = Math.min(safeDt, maxFrameDelta);

  state.accumulator += clampedDt;

  let stepsExecuted = 0;
  while (state.accumulator >= fixedStep - 1e-9 && stepsExecuted < maxSubSteps) {
    state.accumulator = Math.max(0, state.accumulator - fixedStep);
    state.elapsed += fixedStep;
    state.stepCount += 1;
    stepsExecuted += 1;
    onFixedStep(fixedStep, state.elapsed);
  }

  // Prevent spiral-of-death backlog if frame rate momentarily stalls below sub-step budget.
  if (state.accumulator >= fixedStep) {
    state.accumulator %= fixedStep;
  }

  return {
    clampedDt,
    stepsExecuted,
    alpha: Math.min(1, Math.max(0, state.accumulator / fixedStep)),
  };
}
