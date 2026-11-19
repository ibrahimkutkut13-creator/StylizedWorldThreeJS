import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BIOME_COLORS,
  CLIFF_SLOPE_THRESHOLD,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  WATER_LEVEL,
  WORLD_SEED,
  applyBiomeVertexColors,
  createSimplex2D,
  createTerrain,
  getBridgeAnchor,
  getOverlookCenter,
  getPathDistance,
  getRiverCenterX,
  getRiverHalfWidth,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnCenter,
  getTerrainBiomeAt,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
  sampleTerrainBiomeColor,
  terrace,
} from './terrain';

test('createSimplex2D is deterministic for identical seeds and bounded', () => {
  const nA = createSimplex2D(WORLD_SEED);
  const nB = createSimplex2D(WORLD_SEED);
  const nOther = createSimplex2D(WORLD_SEED + 1);

  let diffCount = 0;
  for (let i = -20; i <= 20; i += 1) {
    const x = i * 3.17;
    const y = i * -2.41;
    const a = nA(x, y);
    const b = nB(x, y);
    const c = nOther(x, y);
    assert.equal(a, b);
    assert.ok(a >= -1.05 && a <= 1.05, `simplex out of bounds: ${a}`);
    if (Math.abs(a - c) > 1e-6) diffCount += 1;
  }
  assert.ok(diffCount > 15);
});

test('terrace produces monotonic stepped plateaus', () => {
  let prev = -Infinity;
  for (let h = 0; h <= 24; h += 0.25) {
    const t = terrace(h, 4.4, 3.4);
    assert.ok(t >= prev - 1e-9, `terrace decreased at h=${h}: ${t} < ${prev}`);
    prev = t;
  }

  // Flat plateau shelf near step multiples vs steep riser at mid-step
  const shelfSlope = (terrace(4.5, 4.4, 3.4) - terrace(4.3, 4.4, 3.4)) / 0.2;
  const riserSlope = (terrace(2.3, 4.4, 3.4) - terrace(2.1, 4.4, 3.4)) / 0.2;
  assert.ok(shelfSlope < 0.2, `expected flat shelf, got slope ${shelfSlope}`);
  assert.ok(riserSlope > 2.0, `expected steep riser, got slope ${riserSlope}`);
});

test('river channel, pond, landmarks, spawn clearing, and bridge anchor align cleanly', () => {
  assert.equal(TERRAIN_SIZE, 300);
  assert.equal(WATER_LEVEL, -0.35);

  // River centerline & tranquil pond widen and carve well below WATER_LEVEL
  const bridge = getBridgeAnchor();
  const riverWidthAtBridge = getRiverHalfWidth(bridge.position.z);
  const pondWidth = getRiverHalfWidth(-18);
  assert.ok(
    pondWidth > riverWidthAtBridge + 7,
    `expected tranquil pond widening: pond=${pondWidth}, bridge=${riverWidthAtBridge}`,
  );

  const pondCenterX = getRiverCenterX(-18);
  const pondDepth = getTerrainHeight(pondCenterX, -18);
  assert.ok(
    pondDepth < WATER_LEVEL - 1.8 && pondDepth > -2.7,
    `expected deep pond floor near -2.4, got ${pondDepth}`,
  );
  assert.ok(getRiverSignedDistance(pondCenterX, -18) < -10);

  // River channel at bridge sits below water level while both abutments sit on dry banks
  const underBridgeY = getTerrainHeight(bridge.position.x, bridge.position.z);
  assert.ok(underBridgeY < WATER_LEVEL - 1.0, `river under bridge too shallow: ${underBridgeY}`);

  const dirX = Math.cos(bridge.rotationY);
  const dirZ = -Math.sin(bridge.rotationY);
  const halfSpan = bridge.span * 0.5;
  const westEndX = bridge.position.x - dirX * halfSpan;
  const westEndZ = bridge.position.z - dirZ * halfSpan;
  const eastEndX = bridge.position.x + dirX * halfSpan;
  const eastEndZ = bridge.position.z + dirZ * halfSpan;

  assert.ok(getRiverSignedDistance(westEndX, westEndZ) > 1.0);
  assert.ok(getRiverSignedDistance(eastEndX, eastEndZ) > 1.0);
  assert.ok(Math.abs(getTerrainHeight(westEndX, westEndZ) - bridge.position.y) < 0.08);
  assert.ok(Math.abs(getTerrainHeight(eastEndX, eastEndZ) - bridge.position.y) < 0.08);
  assert.ok(getPathDistance(westEndX, westEndZ) < 0.5);
  assert.ok(getPathDistance(eastEndX, eastEndZ) < 0.5);

  // Spawn clearing is flat and dry
  const spawn = getSpawnCenter();
  assert.ok(Math.abs(getTerrainHeight(spawn.x, spawn.z) - spawn.y) < 0.1);
  assert.ok(getTerrainSlope(spawn.x, spawn.z) < 0.08);
  assert.ok(getPathDistance(spawn.x, spawn.z) < 0.5);

  // Ruins plateau (~11) and Scenic Overlook crest (~16) are flat walkable platforms
  const ruins = getRuinsCenter();
  assert.ok(Math.abs(ruins.y - 11.0) < 0.5);
  for (const [ox, oz] of [
    [0, 0],
    [6, 0],
    [-6, 0],
    [0, 6],
    [0, -6],
  ]) {
    assert.ok(Math.abs(getTerrainHeight(ruins.x + ox, ruins.z + oz) - ruins.y) < 0.2);
    assert.ok(getTerrainSlope(ruins.x + ox, ruins.z + oz) < 0.08);
  }

  const overlook = getOverlookCenter();
  assert.ok(Math.abs(overlook.y - 16.0) < 0.5);
  for (const [ox, oz] of [
    [0, 0],
    [4, 0],
    [-4, 0],
    [0, 4],
    [0, -4],
  ]) {
    assert.ok(Math.abs(getTerrainHeight(overlook.x + ox, overlook.z + oz) - overlook.y) < 0.25);
    assert.ok(getTerrainSlope(overlook.x + ox, overlook.z + oz) < 0.1);
  }

  // Returned vectors are defensive clones
  ruins.set(999, 999, 999);
  assert.notEqual(getRuinsCenter().x, 999);
  overlook.set(999, 999, 999);
  assert.notEqual(getOverlookCenter().x, 999);
  bridge.position.set(999, 999, 999);
  assert.notEqual(getBridgeAnchor().position.x, 999);
});

test('outer valley rim rises into terraced hills (12..28) with steep cliff slopes', () => {
  let maxRimHeight = -Infinity;
  let maxCliffSlope = 0;

  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
    const x = Math.cos(angle) * 120;
    const z = Math.sin(angle) * 120;
    const h = getTerrainHeight(x, z);
    const s = getTerrainSlope(x, z);
    if (h > maxRimHeight) maxRimHeight = h;
    if (s > maxCliffSlope) maxCliffSlope = s;
  }

  assert.ok(
    maxRimHeight >= 12 && maxRimHeight <= 30,
    `expected outer rim height in [12, 30], got ${maxRimHeight}`,
  );
  assert.ok(
    maxCliffSlope > 0.35,
    `expected terraced cliff risers along rim, max slope was ${maxCliffSlope}`,
  );
});

test('createTerrain builds 300x300 mesh matching getTerrainHeight within < 0.05 and cleans up on dispose', () => {
  const scene = new THREE.Scene();
  const terrain = createTerrain(scene);

  assert.equal(terrain.mesh.parent, scene);
  assert.equal(terrain.mesh.name, 'valleyTerrain');
  assert.equal(terrain.mesh.receiveShadow, true);
  assert.equal(terrain.material.vertexColors, true);

  const pos = terrain.geometry.attributes.position;
  const col = terrain.geometry.attributes.color;
  const norm = terrain.geometry.attributes.normal;
  assert.equal(pos.count, (TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1));
  assert.ok(col instanceof THREE.BufferAttribute);
  assert.equal(col.count, pos.count);
  assert.ok(norm instanceof THREE.BufferAttribute);

  // Every vertex matches getTerrainHeight identically
  for (let i = 0; i < pos.count; i += 17) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const expectedY = getTerrainHeight(vx, vz);
    assert.ok(Math.abs(vy - expectedY) < 1e-5);
  }

  // Bilinear mesh height at arbitrary walkable points matches getTerrainHeight within < 0.05
  const step = TERRAIN_SIZE / TERRAIN_SEGMENTS;
  const cols = TERRAIN_SEGMENTS + 1;
  const sampleMeshHeight = (x: number, z: number): number => {
    const gx = (x + TERRAIN_SIZE / 2) / step;
    const gz = (z + TERRAIN_SIZE / 2) / step;
    const ix = Math.min(TERRAIN_SEGMENTS - 1, Math.max(0, Math.floor(gx)));
    const iz = Math.min(TERRAIN_SEGMENTS - 1, Math.max(0, Math.floor(gz)));
    const tx = gx - ix;
    const tz = gz - iz;
    const y00 = pos.getY(iz * cols + ix);
    const y10 = pos.getY(iz * cols + ix + 1);
    const y01 = pos.getY((iz + 1) * cols + ix);
    const y11 = pos.getY((iz + 1) * cols + ix + 1);
    return (
      y00 * (1 - tx) * (1 - tz) +
      y10 * tx * (1 - tz) +
      y01 * (1 - tx) * tz +
      y11 * tx * tz
    );
  };

  const walkableSamples: ReadonlyArray<readonly [number, number]> = [
    [-22.3, 36.4],
    [-11.2, 23.8],
    [0.4, 18.2],
    [13.7, 11.4],
    [25.6, -6.2],
    [41.8, -33.6],
    [-55.4, -29.7],
    [-13.1, -18.3],
    [22.5, 24.1],
    [-34.2, 12.8],
  ];

  for (const [sx, sz] of walkableSamples) {
    const continuousY = getTerrainHeight(sx, sz);
    const interpolatedMeshY = sampleMeshHeight(sx, sz);
    const diff = Math.abs(continuousY - interpolatedMeshY);
    assert.ok(
      diff < 0.05,
      `height mismatch at (${sx}, ${sz}): continuous=${continuousY}, mesh=${interpolatedMeshY}, diff=${diff}`,
    );

    const n = getTerrainNormal(sx, sz);
    assert.ok(Math.abs(n.length() - 1) < 1e-5);
  }

  terrain.dispose();
  assert.equal(terrain.mesh.parent, null);
});

test('Task 07: applyBiomeVertexColors & getTerrainBiomeAt align across all 5 biomes with tight transitions', () => {
  assert.equal(BIOME_COLORS.meadow, '#6ccb5f');
  assert.equal(BIOME_COLORS.pathSand, '#e6c29f');
  assert.equal(BIOME_COLORS.cliffSlate, '#7b8cde');
  assert.equal(CLIFF_SLOPE_THRESHOLD, 0.42);

  const scene = new THREE.Scene();
  const terrain = createTerrain(scene, { useBiomeTexture: false });
  const colorAttr = applyBiomeVertexColors(terrain.geometry);
  const posAttr = terrain.geometry.attributes.position;

  assert.equal(colorAttr, terrain.geometry.attributes.color);
  assert.equal(colorAttr.itemSize, 3);
  assert.equal(colorAttr.count, posAttr.count);

  const linearMeadow = new THREE.Color(BIOME_COLORS.meadow);
  const linearSand = new THREE.Color(BIOME_COLORS.pathSand);
  const linearBed = new THREE.Color(BIOME_COLORS.riverbed);
  const linearCliff = new THREE.Color(BIOME_COLORS.cliffSlate);

  // Confirm Three.js stores sRGB hex constants in linear working space (e.g., #6ccb5f green channel < 0.7)
  assert.ok(linearMeadow.g < 0.65 && linearMeadow.g > 0.5);

  const seenBiomes = new Set<string>();
  let meadowMatches = 0;
  let pathMatches = 0;
  let cliffMatches = 0;
  let waterMatches = 0;
  let shoreMatches = 0;

  const vColor = new THREE.Color();
  for (let i = 0; i < posAttr.count; i += 7) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const biome = getTerrainBiomeAt(x, z);
    seenBiomes.add(biome);

    vColor.setRGB(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
    assert.ok(
      vColor.r >= 0 && vColor.r <= 1.001 &&
      vColor.g >= 0 && vColor.g <= 1.001 &&
      vColor.b >= 0 && vColor.b <= 1.001,
      `vertex color out of linear [0,1] range at (${x}, ${z})`,
    );

    const riverDist = getRiverSignedDistance(x, z);
    const pathDist = getPathDistance(x, z);
    const slope = getTerrainSlope(x, z);

    // Check core interior samples (away from the narrow smoothstep transition edge)
    if (biome === 'meadow' && slope < 0.3 && riverDist > 5.0 && pathDist > 4.0) {
      assert.ok(
        vColor.g > vColor.r * 1.4 && vColor.g > vColor.b * 1.8,
        `expected vibrant meadow green at (${x}, ${z}), got (${vColor.r.toFixed(2)}, ${vColor.g.toFixed(2)}, ${vColor.b.toFixed(2)})`,
      );
      meadowMatches += 1;
    } else if (biome === 'path' && pathDist < 1.2 && riverDist > 2.2) {
      assert.ok(
        Math.hypot(vColor.r - linearSand.r, vColor.g - linearSand.g, vColor.b - linearSand.b) < 0.12,
        `expected warm sandy path #e6c29f at (${x}, ${z}), got (${vColor.r.toFixed(2)}, ${vColor.g.toFixed(2)}, ${vColor.b.toFixed(2)})`,
      );
      pathMatches += 1;
    } else if (biome === 'cliff' && slope > 0.5 && riverDist > 5.0 && pathDist > 4.0) {
      assert.ok(
        vColor.b > vColor.r * 1.6 && vColor.b > vColor.g * 1.35,
        `expected cool slate cliff at (${x}, ${z}), got (${vColor.r.toFixed(2)}, ${vColor.g.toFixed(2)}, ${vColor.b.toFixed(2)})`,
      );
      cliffMatches += 1;
    } else if (biome === 'water' && y < WATER_LEVEL - 0.6) {
      assert.ok(
        Math.hypot(vColor.r - linearBed.r, vColor.g - linearBed.g, vColor.b - linearBed.b) < 0.08,
        `expected pebble-teal riverbed #4e7d8a at (${x}, ${z}), got (${vColor.r.toFixed(2)}, ${vColor.g.toFixed(2)}, ${vColor.b.toFixed(2)})`,
      );
      waterMatches += 1;
    } else if (biome === 'shore' && riverDist > 0.35 && riverDist < 1.35 && y > WATER_LEVEL + 0.05) {
      assert.ok(
        vColor.r > vColor.b * 1.4,
        `expected warm shoreline sand at (${x}, ${z}), got (${vColor.r.toFixed(2)}, ${vColor.g.toFixed(2)}, ${vColor.b.toFixed(2)})`,
      );
      shoreMatches += 1;
    }
  }

  assert.deepEqual(
    Array.from(seenBiomes).sort(),
    ['cliff', 'meadow', 'path', 'shore', 'water'],
  );
  assert.ok(meadowMatches > 200, `expected >200 interior meadow matches, got ${meadowMatches}`);
  assert.ok(pathMatches > 20, `expected >20 interior path matches, got ${pathMatches}`);
  assert.ok(cliffMatches > 100, `expected >100 interior cliff matches, got ${cliffMatches}`);
  assert.ok(waterMatches > 40, `expected >40 interior water matches, got ${waterMatches}`);
  assert.ok(shoreMatches > 10, `expected >10 interior shore matches, got ${shoreMatches}`);

  // Verify sharp smoothstep transition across the 0.42 cliff slope boundary (band width ~0.10)
  const gentleCol = sampleTerrainBiomeColor(70, 8, 20, 0.35, new THREE.Color());
  const steepCol = sampleTerrainBiomeColor(70, 8, 20, 0.49, new THREE.Color());
  assert.ok(gentleCol.g > gentleCol.b * 1.5, 'slope 0.35 should remain pure meadow green');
  assert.ok(
    Math.hypot(steepCol.r - linearCliff.r, steepCol.g - linearCliff.g, steepCol.b - linearCliff.b) < 0.12,
    'slope 0.49 should sharply transition to cool slate #7b8cde',
  );

  terrain.dispose();
});
