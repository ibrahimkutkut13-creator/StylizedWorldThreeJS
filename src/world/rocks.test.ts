import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ROCK_COLORS,
  createBeveledRockGeometry,
  createRocks,
} from './rocks';
import {
  getBridgeAnchor,
  getPathDistance,
  getRuinsCenter,
  getSpawnCenter,
  getTerrainHeight,
} from './terrain';
import { createWater } from './water';

test('ROCK_COLORS matches canonical cool slate, limestone, grass cap, and ink palette', () => {
  assert.equal(ROCK_COLORS.slateDark, '#8493c9');
  assert.equal(ROCK_COLORS.slateMid, '#95a3d6');
  assert.equal(ROCK_COLORS.limestone, '#a9b2c9');
  assert.equal(ROCK_COLORS.mossCap, '#6ccb5f');
  assert.equal(ROCK_COLORS.outline, '#1e1633');
});

test('createBeveledRockGeometry builds high-resolution non-indexed detail:3 stratified planes with watertight smooth normals', () => {
  const slabGeo = createBeveledRockGeometry({
    seed: 101,
    baseShape: 'dodecahedron',
    detail: 3,
    radiusX: 3.1,
    radiusY: 3.35,
    radiusZ: 2.35,
    flattenTop: true,
  });

  // Non-indexed for razor-sharp chiseled planes & detail:3 high-resolution subdivision
  assert.equal(slabGeo.index, null, 'rock geometry must be non-indexed for chiseled planes');
  const pos = slabGeo.getAttribute('position');
  const norm = slabGeo.getAttribute('normal');
  const smooth = slabGeo.getAttribute('aSmoothNormal');

  assert.ok(pos.count >= 900, `detail:3 rock should have high-res vertex count, got ${pos.count}`);
  assert.ok(norm instanceof THREE.BufferAttribute);
  assert.ok(smooth instanceof THREE.BufferAttribute, 'watertight aSmoothNormal must be precomputed');
  assert.equal(smooth.count, pos.count);

  const topCap = slabGeo.getAttribute('aTopCapMask');
  assert.ok(topCap instanceof THREE.BufferAttribute, 'aTopCapMask must be baked for cliff-top grass caps');
  assert.equal(topCap.count, pos.count);

  // Verify flat top cap produces upward-facing planar facets (normal.y > 0.65) in the upper crown
  let flatTopVerts = 0;
  let lowerWallZeroCap = 0;
  const maxY = slabGeo.boundingBox!.max.y;
  const minY = slabGeo.boundingBox!.min.y;
  const midY = (maxY + minY) * 0.5;
  for (let i = 0; i < norm.count; i += 1) {
    if (norm.getY(i) > 0.65 && topCap.getX(i) > 0.7) flatTopVerts += 1;
    if (pos.getY(i) < midY && topCap.getX(i) === 0) lowerWallZeroCap += 1;
  }
  assert.ok(flatTopVerts > 30, `expected flat top facets with normal.y > 0.65 & topCap > 0.7, got ${flatTopVerts}`);
  assert.ok(lowerWallZeroCap > 100, `expected lower wall vertices to stay grass-free, got ${lowerWallZeroCap}`);

  slabGeo.dispose();
});

test('createRocks builds towering terraced cliff walls, stratified outcrops, river boulders, path stones, shader uniforms, and colliders', () => {
  const scene = new THREE.Scene();
  const water = createWater(scene);
  const rocks = createRocks(scene, water);

  assert.equal(rocks.root.parent, scene);
  assert.ok(rocks.stats.cliffWallSlabs >= 36, `expected >= 36 terraced cliff wall slabs, got ${rocks.stats.cliffWallSlabs}`);
  assert.ok(rocks.stats.cliffOutcrops >= 25, `expected >= 25 cliff outcrops, got ${rocks.stats.cliffOutcrops}`);
  assert.ok(rocks.stats.riverBoulders >= 25, `expected >= 25 river boulders, got ${rocks.stats.riverBoulders}`);
  assert.ok(rocks.stats.pathStones >= 30, `expected >= 30 path accent stones, got ${rocks.stats.pathStones}`);
  assert.ok(rocks.colliders.length >= 60, `expected >= 60 rock colliders, got ${rocks.colliders.length}`);

  const archetypeNames = [
    'sculptedCliffWalls',
    'sculptedCliffOutcrops',
    'riverbankBoulders',
    'pathEdgeAccentStones',
  ] as const;

  const spawn = getSpawnCenter();
  const bridge = getBridgeAnchor();
  const ruins = getRuinsCenter();
  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();

  for (const name of archetypeNames) {
    const mesh = rocks.root.getObjectByName(name);
    const outline = rocks.root.getObjectByName(`${name}_inkOutline`);
    assert.ok(mesh instanceof THREE.InstancedMesh, `missing InstancedMesh ${name}`);
    assert.ok(outline instanceof THREE.InstancedMesh, `missing outline InstancedMesh ${name}_inkOutline`);
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
    assert.equal(outline.castShadow, false);
    assert.equal(outline.userData.isInkOutline, true);
    assert.equal(mesh.count, outline.count);

    const toonMat = mesh.material as THREE.MeshToonMaterial;
    assert.equal(toonMat.userData.animeToonSteps, 2, `${name} must use crisp 2-tone cel shading`);
    assert.ok(toonMat.userData.rockStrataUniforms, `${name} must attach custom strata & grass-cap uniforms`);

    const expectsGrassCap = name === 'sculptedCliffWalls' || name === 'sculptedCliffOutcrops';
    assert.equal(
      toonMat.userData.rockStrataUniforms.uGrassCapEnabled.value,
      expectsGrassCap ? 1.0 : 0.0,
    );

    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, mat4);
      pos.setFromMatrixPosition(mat4);
      const groundY = getTerrainHeight(pos.x, pos.z);

      assert.ok(
        pos.y <= groundY - 0.15,
        `${name} #${i} should be grounded/sunk into slope (y=${pos.y.toFixed(2)}, ground=${groundY.toFixed(2)})`,
      );
      assert.ok(
        getPathDistance(pos.x, pos.z) >= 2.8,
        `${name} #${i} at (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) must not block footpath`,
      );
      assert.ok(Math.hypot(pos.x - spawn.x, pos.z - spawn.z) >= 7.5);
      assert.ok(Math.hypot(pos.x - bridge.position.x, pos.z - bridge.position.z) >= 8.5);
      assert.ok(Math.hypot(pos.x - ruins.x, pos.z - ruins.z) >= 10.0);
    }
  }

  // Verify foreground river boulders registered foam obstacles with water
  assert.ok(water.obstacles.length >= 6, `expected >= 6 water foam obstacles, got ${water.obstacles.length}`);

  rocks.dispose();
  water.dispose();
  assert.equal(rocks.root.parent, null);
});
