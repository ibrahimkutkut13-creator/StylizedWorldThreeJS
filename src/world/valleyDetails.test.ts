import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWater } from './water';
import { createValleyDetails } from './valleyDetails';
import {
  WATER_LEVEL,
  getBridgeAnchor,
  getRiverCenterX,
  getRiverSignedDistance,
  getSpawnCenter,
  getTerrainBiomeAt,
} from './terrain';

test('getTerrainBiomeAt classifies water, path, and meadow accurately', () => {
  const pondX = getRiverCenterX(-18);
  assert.equal(getTerrainBiomeAt(pondX, -18), 'water');

  const spawn = getSpawnCenter();
  assert.equal(getTerrainBiomeAt(spawn.x, spawn.z), 'path');

  assert.equal(getTerrainBiomeAt(-34, 24), 'meadow');
});

test('createWater mounts river/pond surface at WATER_LEVEL and registers foam obstacles cleanly', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);

  assert.equal(water.mesh.parent, scene);
  assert.equal(water.mesh.position.y, WATER_LEVEL);
  assert.equal(water.material.transparent, true);
  assert.equal(water.material.fog, true);

  const depthAttr = water.mesh.geometry.attributes.aDepth;
  assert.ok(depthAttr instanceof THREE.BufferAttribute);

  const bridge = getBridgeAnchor();
  water.registerFoamObstacle(bridge.position.x, bridge.position.z, 1.5);
  assert.equal(water.obstacles.length, 1);

  water.update(1 / 60, 4.2);
  assert.equal(water.material.uniforms.uTime.value, 4.2);

  water.setMoodTint('#45bfff', '#228bd6', '#fff5cc');
  assert.equal('#' + water.material.uniforms.uBaseColor.value.getHexString(), '#45bfff');

  water.dispose();
  assert.equal(water.mesh.parent, null);
});

test('createValleyDetails populates landmarks, lanterns, and disposes cleanly', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);
  const details = createValleyDetails(scene, water);

  assert.equal(details.root.parent, scene);
  assert.ok(details.stats.lanterns >= 10, `expected lanterns >= 10, got ${details.stats.lanterns}`);
  assert.equal(details.stats.landmarks, 5);

  // Torii gate straddles perpendicular across the ascending east trail
  const torii = details.root.getObjectByName('vermilionToriiGate');
  assert.ok(torii instanceof THREE.Group);
  assert.ok(torii.rotation.y < -0.35 && torii.rotation.y > -0.46, `unexpected torii rotation.y=${torii.rotation.y}`);

  // Stepping-stones and river boulders registered foam obstacles with water
  assert.ok(water.obstacles.length >= 6);

  // Verify animation update runs without NaN positions
  details.update(1 / 60, 2.5);
  const crystal = details.root.getObjectByName('ruinsFloatingCrystal');
  assert.ok(crystal instanceof THREE.Mesh);
  assert.ok(Number.isFinite(crystal.position.y));

  details.dispose();
  water.dispose();
  assert.equal(details.root.parent, null);
});
