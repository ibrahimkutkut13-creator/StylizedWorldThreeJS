import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXED_STEP,
  MAX_FRAME_DELTA,
  advanceFixedLoop,
  createFixedLoopState,
} from './fixedLoop';

test('executes exact fixed 1/60 steps and retains fractional accumulator', () => {
  const state = createFixedLoopState();
  const recordedDts: number[] = [];

  const first = advanceFixedLoop(state, FIXED_STEP * 1.5, (dt) => {
    recordedDts.push(dt);
  });

  assert.equal(first.stepsExecuted, 1);
  assert.equal(recordedDts.length, 1);
  assert.ok(Math.abs(recordedDts[0] - FIXED_STEP) < 1e-9);
  assert.ok(Math.abs(first.alpha - 0.5) < 1e-6);

  const second = advanceFixedLoop(state, FIXED_STEP * 0.5, (dt) => {
    recordedDts.push(dt);
  });

  assert.equal(second.stepsExecuted, 1);
  assert.equal(state.stepCount, 2);
  assert.ok(Math.abs(state.elapsed - FIXED_STEP * 2) < 1e-9);
});

test('clamps large frame delta spikes such as tab switches', () => {
  const state = createFixedLoopState();
  let calls = 0;

  const result = advanceFixedLoop(state, 5.0, () => {
    calls += 1;
  });

  assert.equal(result.clampedDt, MAX_FRAME_DELTA);
  assert.equal(calls, 3); // 0.05 / (1/60) === 3 exact fixed steps
  assert.ok(state.accumulator < FIXED_STEP);
});

test('caps sub-steps at maxSubSteps and trims overflow backlog', () => {
  const state = createFixedLoopState();
  let calls = 0;

  const result = advanceFixedLoop(
    state,
    0.2,
    () => {
      calls += 1;
    },
    { maxFrameDelta: 0.2, maxSubSteps: 4, fixedStep: 1 / 60 },
  );

  assert.equal(result.stepsExecuted, 4);
  assert.equal(calls, 4);
  assert.ok(state.accumulator < FIXED_STEP);
});

test('handles zero, negative, and NaN deltas safely', () => {
  const state = createFixedLoopState();
  let calls = 0;

  for (const badDt of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = advanceFixedLoop(state, badDt, () => {
      calls += 1;
    });
    assert.equal(result.stepsExecuted, 0);
    assert.equal(result.clampedDt, 0);
  }

  assert.equal(calls, 0);
  assert.equal(state.elapsed, 0);
});
