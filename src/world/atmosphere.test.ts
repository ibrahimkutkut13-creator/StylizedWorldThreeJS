import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_ATMOSPHERE_CONFIG,
  DEFAULT_SHADOW_HALF_EXTENT,
  SHADOW_MAP_SIZE,
  computeSunDirection,
  createAtmosphere,
} from './atmosphere';

test('createAtmosphere configures GLSL sky dome, FogExp2, 2048x2048 sun shadows, and HemisphereLight', () => {
  const scene = new THREE.Scene();
  const atm = createAtmosphere(scene, { isSoftwareGl: false });

  assert.equal(atm.skyMesh.parent, scene);
  assert.equal(atm.skyMaterial.side, THREE.BackSide);
  assert.equal(atm.skyMaterial.depthWrite, false);
  assert.equal(atm.skyMaterial.fog, false);
  assert.equal(
    '#' + atm.skyUniforms.uZenithColor.value.getHexString(),
    '#2d9cff',
  );
  assert.equal(
    '#' + atm.skyUniforms.uHorizonColor.value.getHexString(),
    '#a8e6ff',
  );

  assert.ok(scene.fog instanceof THREE.FogExp2);
  assert.equal(scene.fog, atm.fog);
  assert.equal(atm.fog.density, DEFAULT_ATMOSPHERE_CONFIG.fogDensity);
  assert.ok(atm.fog.density <= 0.0022, 'foreground fog haze must be light for crisp grass shadows');
  assert.ok(atm.skyMaterial.fragmentShader.includes('cloudFbm'), 'sky dome must include layered soft cumulus clouds');

  assert.equal(atm.sunLight.castShadow, true);
  assert.equal(SHADOW_MAP_SIZE, 4096);
  assert.equal(atm.sunLight.shadow.mapSize.width, 4096);
  assert.equal(atm.sunLight.shadow.mapSize.height, 4096);
  assert.equal(DEFAULT_SHADOW_HALF_EXTENT, 18);
  assert.equal(atm.sunLight.shadow.camera.right, 18);
  assert.equal(atm.sunLight.shadow.camera.left, -18);
  assert.equal(atm.sunLight.shadow.camera.top, 18);
  assert.equal(atm.sunLight.shadow.camera.bottom, -18);
  assert.equal(atm.sunLight.shadow.normalBias, 0.06);
  assert.equal(atm.sunLight.shadow.bias, -0.0005);
  assert.equal(atm.sunLight.shadow.radius, 3);
  assert.equal(atm.sunLight.shadow.blurSamples, 8);

  assert.ok(atm.hemiLight instanceof THREE.HemisphereLight);
  assert.equal(atm.hemiLight.parent, scene);

  const expectedSunDir = computeSunDirection(DEFAULT_ATMOSPHERE_CONFIG.sunPosition);
  const actualSunDir = atm.getSunDirection();
  assert.ok(actualSunDir.distanceTo(expectedSunDir) < 1e-6);

  atm.dispose();
  assert.equal(scene.fog, null);
  assert.equal(atm.skyMesh.parent, null);
  assert.equal(atm.sunLight.parent, null);
  assert.equal(atm.hemiLight.parent, null);
});

test('createAtmosphere disables shadow casting when isSoftwareGl is true while preserving light intensities', () => {
  const scene = new THREE.Scene();
  const atm = createAtmosphere(scene, { isSoftwareGl: true });

  assert.equal(atm.sunLight.castShadow, false);
  assert.equal(atm.sunLight.intensity, DEFAULT_ATMOSPHERE_CONFIG.sunIntensity);
  assert.equal(atm.hemiLight.intensity, DEFAULT_ATMOSPHERE_CONFIG.hemiIntensity);

  atm.dispose();
});

test('applyMood, update, and setShadowCenter update sky uniforms, fog, and shadow bounds cleanly', () => {
  const scene = new THREE.Scene();
  const atm = createAtmosphere(scene);

  atm.applyMood({
    zenithColor: '#121738',
    horizonColor: '#2a3f6b',
    fogColor: '#1e2b4d',
    fogDensity: 0.006,
    starIntensity: 1.0,
    sunPosition: [-60, 80, -40],
    sunIntensity: 1.2,
    hemiIntensity: 0.55,
  });

  assert.equal('#' + atm.skyUniforms.uZenithColor.value.getHexString(), '#121738');
  assert.equal('#' + atm.skyUniforms.uHorizonColor.value.getHexString(), '#2a3f6b');
  assert.equal('#' + atm.fog.color.getHexString(), '#1e2b4d');
  assert.equal(atm.fog.density, 0.006);
  assert.equal(atm.skyUniforms.uStarIntensity.value, 1.0);
  assert.equal(atm.sunLight.intensity, 1.2);
  assert.equal(atm.hemiLight.intensity, 0.55);

  atm.update(1 / 60, 12.5, new THREE.Vector3(42, 8, -19));
  assert.equal(atm.skyUniforms.uTime.value, 12.5);
  assert.equal(atm.skyMesh.position.x, 42);
  assert.equal(atm.skyMesh.position.y, 0);
  assert.equal(atm.skyMesh.position.z, -19);

  atm.setShadowCenter(25.3, -14.7, 64);
  assert.equal(atm.sunLight.shadow.camera.right, 64);
  assert.equal(atm.sunLight.shadow.camera.left, -64);
  assert.ok(Math.abs(atm.sunLight.target.position.x - 25.3) < 0.2);
  assert.ok(Math.abs(atm.sunLight.target.position.z - -14.7) < 0.2);

  atm.dispose();
});
