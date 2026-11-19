import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GRASS_COLORS,
  createGoldenBlossomGeometry,
  createGrass,
  createLavenderSpikeGeometry,
  createLushGrassTuftGeometry,
  createPinkWildflowerGeometry,
} from './grass';
import { getPathDistance, getTerrainBiomeAt } from './terrain';

test('GRASS_COLORS defines vibrant lime-to-emerald grass and lavender/pink/golden floral hues', () => {
  assert.equal(GRASS_COLORS.rootEmerald, '#248f42');
  assert.equal(GRASS_COLORS.sunlitLime, '#b8f24d');
  assert.equal(GRASS_COLORS.lavenderBright, '#8240ff');
  assert.equal(GRASS_COLORS.pinkWildflower, '#ff4eb8');
  assert.equal(GRASS_COLORS.goldenBlossom, '#ffd91a');
});

test('grass and wildflower geometries bake 3-segment curved blades, seamless base colors, and upward-biased normals', () => {
  const tuft = createLushGrassTuftGeometry();
  const lavender = createLavenderSpikeGeometry();
  const pink = createPinkWildflowerGeometry();
  const golden = createGoldenBlossomGeometry();

  // 3 blades * 3 vertical segments (5 triangles = 15 verts per blade) = 45 verts per tuft
  assert.equal(tuft.getAttribute('position').count, 45, '3-blade 3-segment grass tuft should have 45 vertices');
  const tuftColors = tuft.getAttribute('color');
  assert.ok(tuftColors instanceof THREE.BufferAttribute);
  // Root vertex (index 0) must be pure white (#ffffff) so blade base equals exact ground color underneath
  assert.ok(
    tuftColors.getX(0) > 0.99 && tuftColors.getY(0) > 0.99 && tuftColors.getZ(0) > 0.99,
    'grass blade root vertex color must be white for seamless ground color blending',
  );

  for (const [label, geo] of [
    ['tuft', tuft],
    ['lavender', lavender],
    ['pink', pink],
    ['golden', golden],
  ] as const) {
    assert.ok(geo.getAttribute('position').count > 18, `${label} must have vertex geometry`);
    assert.ok(geo.getAttribute('color') instanceof THREE.BufferAttribute, `${label} must have vertex colors`);
    const norm = geo.getAttribute('normal');
    assert.ok(norm instanceof THREE.BufferAttribute);
    assert.ok(norm.getY(0) > 0.85, `${label} normal must bias strongly upward`);
    geo.dispose();
  }
});

test('createGrass scatters 85,000+ slender blades with doubled foreground density and dense wildflowers cleanly on meadow slopes', () => {
  const scene = new THREE.Scene();
  const grass = createGrass(scene);

  assert.equal(grass.root.parent, scene);
  assert.ok(
    grass.stats.grassBlades >= 85000,
    `expected >= 85,000 individual grass blades with doubled foreground density, got ${grass.stats.grassBlades}`,
  );
  assert.ok(grass.stats.lavenderClusters >= 700, `expected >= 700 lavender clusters, got ${grass.stats.lavenderClusters}`);
  assert.ok(grass.stats.pinkFlowerClusters >= 700, `expected >= 700 pink flower clusters, got ${grass.stats.pinkFlowerClusters}`);
  assert.ok(grass.stats.goldenFlowerClusters >= 700, `expected >= 700 golden flower clusters, got ${grass.stats.goldenFlowerClusters}`);

  const bladesMesh = grass.root.getObjectByName('denseMeadowGrassBlades');
  const lavenderMesh = grass.root.getObjectByName('tallPurpleLavenderSpikes');
  const pinkMesh = grass.root.getObjectByName('pinkMeadowWildflowers');
  const goldenMesh = grass.root.getObjectByName('goldenYellowBlossoms');

  assert.ok(bladesMesh instanceof THREE.InstancedMesh);
  assert.ok(lavenderMesh instanceof THREE.InstancedMesh);
  assert.ok(pinkMesh instanceof THREE.InstancedMesh);
  assert.ok(goldenMesh instanceof THREE.InstancedMesh);

  assert.equal(bladesMesh.receiveShadow, true);
  assert.equal(bladesMesh.castShadow, false);

  // Sample grass & flower placements to guarantee none invade footpaths or water
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const stride = Math.max(1, Math.floor(bladesMesh.count / 120));
  for (let i = 0; i < bladesMesh.count; i += stride) {
    bladesMesh.getMatrixAt(i, mat);
    pos.setFromMatrixPosition(mat);
    assert.equal(getTerrainBiomeAt(pos.x, pos.z), 'meadow');
    assert.ok(getPathDistance(pos.x, pos.z) >= 2.5);
  }

  grass.update(1 / 60, 5.5);
  assert.equal(grass.windUniforms.uWindTime.value, 5.5);

  grass.dispose();
  assert.equal(grass.root.parent, null);
});
