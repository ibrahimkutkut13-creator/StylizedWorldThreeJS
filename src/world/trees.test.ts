import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CANOPY_SUBCROWNS,
  TREE_COLORS,
  createFluffyCanopyGeometry,
  createLeafClusterTexture,
  createMossyShrubGeometry,
  createTreeTrunkGeometry,
  createTrees,
  getCanopyCardCount,
} from './trees';
import {
  getBridgeAnchor,
  getPathDistance,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnCenter,
  getTerrainBiomeAt,
  getTerrainHeight,
} from './terrain';

test('TREE_COLORS defines deep teal-emerald, pastel sakura pink, warm golden-amber, and mossy shrub hues', () => {
  assert.equal(TREE_COLORS.deepTealCore, '#053b3e');
  assert.equal(TREE_COLORS.sakuraPink, '#ff96dc');
  assert.equal(TREE_COLORS.goldenAmber, '#ff9e08');
  assert.equal(TREE_COLORS.mossShrubSun, '#7ae842');
});

test('createLeafClusterTexture builds crisp alpha-cutout textures for all 3 feathery foliage variants', () => {
  for (const variant of ['featheryFrond', 'sakuraSpray', 'goldenSprig'] as const) {
    const tex = createLeafClusterTexture(variant);
    assert.ok(tex instanceof THREE.Texture);
    assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
    tex.dispose();
  }
});

test('createTreeTrunkGeometry produces outward-facing curved trunks with mossy root flares and no outlines', () => {
  for (const kind of ['deepTeal', 'pastelSakura', 'goldenAmber'] as const) {
    const geo = createTreeTrunkGeometry(kind);
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const color = geo.getAttribute('color');

    assert.ok(pos.count > 160, `${kind} trunk should have curved branch detail`);
    assert.ok(color instanceof THREE.BufferAttribute, `${kind} trunk must have mossy root-to-bark colors`);
    assert.ok(geo.boundingBox && geo.boundingBox.min.y < -0.5);
    assert.ok(geo.boundingBox && geo.boundingBox.max.y > 3.4);

    let outwardCount = 0;
    let sampledCount = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const py = pos.getY(i);
      if (py > 0.2 && py < 1.2) {
        const px = pos.getX(i);
        const pz = pos.getZ(i);
        const radialDot = px * norm.getX(i) + pz * norm.getZ(i);
        sampledCount += 1;
        if (radialDot > 0) outwardCount += 1;
      }
    }
    assert.ok(sampledCount > 20);
    assert.ok(outwardCount / sampledCount > 0.9, `${kind} trunk normals must face outward`);

    geo.dispose();
  }
});

test('createFluffyCanopyGeometry builds 400+ overlapping rounded dome cards with upward-bent normals for all 3 varieties', () => {
  for (const kind of ['deepTeal', 'pastelSakura', 'goldenAmber'] as const) {
    const subCount = CANOPY_SUBCROWNS[kind].subCrowns.length;
    assert.ok(subCount >= 6, `${kind} should have >= 6 lush rounded dome sub-crowns, got ${subCount}`);

    const cardCount = getCanopyCardCount(kind);
    assert.ok(cardCount >= 400, `${kind} must use 400+ overlapping botanical leaf cards, got ${cardCount}`);

    const geo = createFluffyCanopyGeometry(kind);
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const color = geo.getAttribute('color');

    assert.equal(pos.count, cardCount * 6);
    assert.ok(uv instanceof THREE.BufferAttribute);
    assert.ok(color instanceof THREE.BufferAttribute);

    let sumNy = 0;
    let minNy = Infinity;
    for (let i = 0; i < norm.count; i += 1) {
      const len = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
      assert.ok(Math.abs(len - 1) < 1e-3);
      const ny = norm.getY(i);
      sumNy += ny;
      if (ny < minNy) minNy = ny;
    }

    const avgNy = sumNy / norm.count;
    assert.ok(avgNy > 0.5, `${kind} average normal.y (${avgNy.toFixed(2)}) must bend upward`);
    assert.ok(minNy > -0.25, `${kind} min normal.y (${minNy.toFixed(2)}) must avoid dark inverted undersides`);

    geo.dispose();
  }

  const shrubGeo = createMossyShrubGeometry();
  assert.ok(shrubGeo.getAttribute('position').count >= 40 * 6);
  shrubGeo.dispose();
});

test('createTrees mounts 3 outline-free feathery tree varieties, mossy root shrubs, dappled shadows, and wind sway', () => {
  const scene = new THREE.Scene();
  const trees = createTrees(scene);

  assert.equal(trees.root.parent, scene);
  assert.ok(trees.stats.totalTrees >= 45 && trees.stats.totalTrees <= 65);
  assert.ok(trees.stats.deepTeal >= 15);
  assert.ok(trees.stats.pastelSakura >= 8);
  assert.ok(trees.stats.goldenAmber >= 8);
  assert.ok(trees.stats.mossyShrubs >= 60, `expected >= 60 mossy root shrubs, got ${trees.stats.mossyShrubs}`);
  assert.ok(trees.stats.ridgeTrees >= 35, `expected >= 35 distant ridge-line trees, got ${trees.stats.ridgeTrees}`);
  assert.equal(trees.colliders.length, trees.stats.totalTrees);

  // Confirm ZERO heavy black ink outlines exist on tree trunks or foliage
  trees.root.traverse((obj) => {
    assert.notEqual(obj.userData.isInkOutline, true, 'trees must not carry heavy black ink outlines');
  });

  const shrubMesh = trees.root.getObjectByName('mossyTreeRootShrubs');
  assert.ok(shrubMesh instanceof THREE.InstancedMesh);
  assert.equal(shrubMesh.castShadow, true);
  assert.equal(shrubMesh.receiveShadow, true);

  const ridgeCanopies = trees.root.getObjectByName('distantRidgeTreeCanopies');
  assert.ok(ridgeCanopies instanceof THREE.InstancedMesh);
  assert.ok(ridgeCanopies.count >= 35);

  for (const kind of ['deepTeal', 'pastelSakura', 'goldenAmber'] as const) {
    const trunk = trees.root.getObjectByName(`animeTreeTrunks_${kind}`);
    const canopy = trees.root.getObjectByName(`animeTreeCanopies_${kind}`);

    assert.ok(trunk instanceof THREE.InstancedMesh);
    assert.ok(canopy instanceof THREE.InstancedMesh);
    assert.equal(trunk.count, canopy.count);
    assert.equal(canopy.castShadow, true);
    assert.equal(canopy.receiveShadow, true);
    assert.ok(canopy.customDepthMaterial instanceof THREE.MeshDepthMaterial);
    assert.equal(canopy.customDepthMaterial.alphaTest, 0.4);
    assert.equal(canopy.customDepthMaterial.side, THREE.DoubleSide);

    const canopyMat = canopy.material as THREE.MeshToonMaterial;
    assert.equal(canopyMat.alphaTest, 0.4);
    assert.equal(canopyMat.side, THREE.DoubleSide);
    assert.ok(canopyMat.map instanceof THREE.Texture);
    assert.ok(canopyMat.userData.windUniforms);
    assert.ok(canopyMat.userData.sunRimUniforms, `${kind} must attach warm sun-facing top rim-glow uniforms`);

    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const spawn = getSpawnCenter();
    const bridge = getBridgeAnchor();
    const ruins = getRuinsCenter();

    for (let i = 0; i < trunk.count; i += 1) {
      trunk.getMatrixAt(i, mat);
      pos.setFromMatrixPosition(mat);
      const groundY = getTerrainHeight(pos.x, pos.z);

      assert.equal(getTerrainBiomeAt(pos.x, pos.z), 'meadow');
      assert.ok(pos.y <= groundY - 0.1);
      assert.ok(getRiverSignedDistance(pos.x, pos.z) >= 3.8);
      assert.ok(getPathDistance(pos.x, pos.z) >= 4.0);
      assert.ok(Math.hypot(pos.x - spawn.x, pos.z - spawn.z) >= 11.0);
      assert.ok(Math.hypot(pos.x - bridge.position.x, pos.z - bridge.position.z) >= 11.0);
      assert.ok(Math.hypot(pos.x - ruins.x, pos.z - ruins.z) >= 11.0);
    }
  }

  trees.update(1 / 60, 7.25);
  assert.equal(trees.windUniforms.uWindTime.value, 7.25);
  trees.setWindStrength(1.5);
  assert.equal(trees.windUniforms.uWindStrength.value, 1.5);

  trees.dispose();
  assert.equal(trees.root.parent, null);
});
