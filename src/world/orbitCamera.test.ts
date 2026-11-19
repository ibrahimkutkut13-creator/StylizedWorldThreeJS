import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_ORBIT_BOUNDS,
  clampOrbitAngles,
  computeOrbitCameraPosition,
  stepOrbitCamera,
  type OrbitCameraState,
} from './orbitCamera';

test('clampOrbitAngles constrains pitch and distance safely', () => {
  const low = clampOrbitAngles(-0.8, 2);
  assert.equal(low.pitch, DEFAULT_ORBIT_BOUNDS.minPitch);
  assert.equal(low.distance, DEFAULT_ORBIT_BOUNDS.minDistance);

  const high = clampOrbitAngles(3.0, 500);
  assert.equal(high.pitch, DEFAULT_ORBIT_BOUNDS.maxPitch);
  assert.equal(high.distance, DEFAULT_ORBIT_BOUNDS.maxDistance);
});

test('computeOrbitCameraPosition places camera on sphere around target', () => {
  const target = new THREE.Vector3(4, 3, -4);
  const pos = computeOrbitCameraPosition(target, 0, 0, 20);
  assert.ok(Math.abs(pos.x - 4) < 1e-6);
  assert.ok(Math.abs(pos.y - 3) < 1e-6);
  assert.ok(Math.abs(pos.z - 16) < 1e-6);

  // Rotating 90 deg yaw orbits to +X
  const posRight = computeOrbitCameraPosition(target, Math.PI / 2, 0, 20);
  assert.ok(Math.abs(posRight.x - 24) < 1e-5);
  assert.ok(Math.abs(posRight.z - -4) < 1e-5);
});

test('stepOrbitCamera damps smoothly toward targetYaw/pitch/distance and respects ground clearance', () => {
  const state: OrbitCameraState = {
    target: new THREE.Vector3(0, 2, 0),
    yaw: 0,
    pitch: 0.4,
    distance: 50,
    targetYaw: Math.PI, // 180 deg rotation allowed freely
    targetPitch: 0.8,
    targetDistance: 35,
  };

  const pos1 = stepOrbitCamera(state, 1 / 60, DEFAULT_ORBIT_BOUNDS, 10);
  assert.ok(state.yaw > 0 && state.yaw < Math.PI);
  assert.ok(state.pitch > 0.4 && state.pitch < 0.8);
  assert.ok(state.distance < 50 && state.distance > 35);
  assert.ok(Number.isFinite(pos1.x) && Number.isFinite(pos1.y) && Number.isFinite(pos1.z));

  // Verify ground clearance prevents underground clipping
  const lowState: OrbitCameraState = {
    target: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0.1,
    distance: 30,
    targetYaw: 0,
    targetPitch: 0.1,
    targetDistance: 30,
  };
  const clampedPos = stepOrbitCamera(
    lowState,
    0,
    DEFAULT_ORBIT_BOUNDS,
    10,
    () => 12, // tall hill right under camera
  );
  assert.ok(
    clampedPos.y >= 12 + DEFAULT_ORBIT_BOUNDS.minGroundClearance - 1e-5,
    `expected camera y >= 14.5, got ${clampedPos.y}`,
  );
});
