import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WATER_COLORS, createWater } from './water';
import { WATER_LEVEL, getRiverCenterX, getTerrainHeight } from './terrain';

test('WATER_COLORS matches canonical Task 08 turquoise and foam hex palette', () => {
  assert.equal(WATER_COLORS.shallow, '#6be0ff');
  assert.equal(WATER_COLORS.base, '#38b6ff');
  assert.equal(WATER_COLORS.deep, '#1f8ad8');
  assert.equal(WATER_COLORS.foam, '#f4fdff');
});

test('createWater builds depth-baked geometry at WATER_LEVEL with FogExp2 and anti-Z-fighting enabled', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene, {
    sunDirection: new THREE.Vector3(10, 20, 5),
  });

  assert.equal(water.mesh.parent, scene);
  assert.equal(water.mesh.name, 'valleyRiverWater');
  assert.equal(water.mesh.position.y, WATER_LEVEL);
  assert.equal(water.material.transparent, true);
  assert.equal(water.material.depthWrite, false);
  assert.equal(water.material.fog, true);
  assert.equal(water.material.polygonOffset, true);

  const posAttr = water.mesh.geometry.attributes.position;
  const depthAttr = water.mesh.geometry.attributes.aDepth;
  const shoreAttr = water.mesh.geometry.attributes.aShoreFactor;
  const obsAttr = water.mesh.geometry.attributes.aObstacleDist;

  assert.ok(depthAttr instanceof THREE.BufferAttribute);
  assert.ok(shoreAttr instanceof THREE.BufferAttribute);
  assert.ok(obsAttr instanceof THREE.BufferAttribute);
  assert.equal(depthAttr.count, posAttr.count);

  // Verify precomputed aDepth = WATER_LEVEL - getTerrainHeight(x, z) and deep pond exists
  let deepSamples = 0;
  let shallowSamples = 0;
  for (let i = 0; i < posAttr.count; i += 29) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);
    const expectedDepth = WATER_LEVEL - getTerrainHeight(wx, wz);
    assert.ok(Math.abs(depthAttr.getX(i) - expectedDepth) < 1e-4);
    if (expectedDepth > 1.2) deepSamples += 1;
    if (expectedDepth > 0.05 && expectedDepth < 0.55) {
      shallowSamples += 1;
      assert.ok(shoreAttr.getX(i) > 0 && shoreAttr.getX(i) <= 1);
    }
  }
  assert.ok(deepSamples > 10, `expected deep river/pond samples, got ${deepSamples}`);
  assert.ok(shallowSamples > 5, `expected shallow shoreline samples, got ${shallowSamples}`);

  // Sun direction is normalized
  const sunDir = water.material.uniforms.uSunDirection.value as THREE.Vector3;
  assert.ok(Math.abs(sunDir.length() - 1) < 1e-5);

  water.dispose();
  assert.equal(water.mesh.parent, null);
});

test('createWater updates foam obstacles, animation time, sun direction, and mood tint presets', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);

  const pondX = getRiverCenterX(-18);
  const obsAttr = water.mesh.geometry.attributes.aObstacleDist as THREE.BufferAttribute;
  const beforeMin = Math.min(...Array.from(obsAttr.array as Float32Array));
  assert.equal(beforeMin, 99);

  water.registerFoamObstacle(pondX, -18, 1.2);
  assert.equal(water.obstacles.length, 1);
  const afterMin = Math.min(...Array.from(obsAttr.array as Float32Array));
  assert.ok(afterMin < 0.5, `expected obstacle distance near rock < 0.5, got ${afterMin}`);

  water.update(1 / 60, 7.25);
  assert.equal(water.material.uniforms.uTime.value, 7.25);

  water.setSunDirection(new THREE.Vector3(-4, 2, -6));
  const updatedSun = water.material.uniforms.uSunDirection.value as THREE.Vector3;
  assert.ok(Math.abs(updatedSun.length() - 1) < 1e-5);
  assert.ok(updatedSun.x < 0);

  // Task 08 canonical 3-arg setMoodTint(baseHex, deepHex, sparkleHex)
  water.setMoodTint('#f4936a', '#8c4b78', '#ffe3a8');
  assert.equal('#' + water.material.uniforms.uBaseColor.value.getHexString(), '#f4936a');
  assert.equal('#' + water.material.uniforms.uDeepColor.value.getHexString(), '#8c4b78');
  assert.equal('#' + water.material.uniforms.uSparkleColor.value.getHexString(), '#ffe3a8');
  // Automatically derives a brighter complementary shallow tint
  assert.notEqual(
    '#' + water.material.uniforms.uShallowColor.value.getHexString(),
    WATER_COLORS.shallow,
  );

  // Explicit 4th shallowHex override also works
  water.setMoodTint('#38b6ff', '#1f8ad8', '#fff9dc', '#6be0ff');
  assert.equal('#' + water.material.uniforms.uShallowColor.value.getHexString(), '#6be0ff');

  water.dispose();
});
