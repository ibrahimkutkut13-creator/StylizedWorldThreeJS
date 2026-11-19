import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_ANIME_TOON_OPTIONS,
  DEFAULT_GRADIENT_STOPS,
  DEFAULT_OUTLINE_COLOR,
  DEFAULT_OUTLINE_THICKNESS,
  addInkOutline,
  addInkOutlineToGroup,
  buildToonGradientData,
  computeSmoothNormalsAttribute,
  createAnimeToonMaterial,
  disposeToonGradientMaps,
  getToonGradientMap,
  resolveAnimeToonOptions,
  updateAnimeToonMaterial,
  type AnimeToonUniforms,
} from './toonMaterials';

test('buildToonGradientData builds crisp 3-step and 2-step RGBA ramps', () => {
  const threeStep = buildToonGradientData(3);
  assert.equal(threeStep.width, DEFAULT_GRADIENT_STOPS[3].length);
  assert.equal(threeStep.distinctLevels, 3);
  assert.equal(threeStep.data.length, DEFAULT_GRADIENT_STOPS[3].length * 4);
  assert.equal(threeStep.data[0], DEFAULT_GRADIENT_STOPS[3][0]);
  assert.equal(threeStep.data[3], 255);
  assert.equal(
    threeStep.data[(threeStep.width - 1) * 4],
    DEFAULT_GRADIENT_STOPS[3][threeStep.width - 1],
  );

  const twoStep = buildToonGradientData(2);
  assert.equal(twoStep.width, 2);
  assert.equal(twoStep.distinctLevels, 2);
  assert.equal(twoStep.data.length, 8);
  assert.equal(twoStep.data[0], DEFAULT_GRADIENT_STOPS[2][0]);
  assert.equal(twoStep.data[4], DEFAULT_GRADIENT_STOPS[2][1]);
});

test('getToonGradientMap configures nearest filtering, disables mipmaps, and caches instances', () => {
  disposeToonGradientMaps();

  const mapA = getToonGradientMap(3);
  const mapB = getToonGradientMap(3);
  const mapTwo = getToonGradientMap(2);

  assert.equal(mapA, mapB);
  assert.notEqual(mapA, mapTwo);
  assert.equal(mapA.minFilter, THREE.NearestFilter);
  assert.equal(mapA.magFilter, THREE.NearestFilter);
  assert.equal(mapA.generateMipmaps, false);
  assert.equal(mapA.colorSpace, THREE.NoColorSpace);

  disposeToonGradientMaps();
  const mapAfterDispose = getToonGradientMap(3);
  assert.notEqual(mapA, mapAfterDispose);
  disposeToonGradientMaps();
});

test('createAnimeToonMaterial configures defaults, options, cache key, and live uniforms', () => {
  const mat = createAnimeToonMaterial('#6ccb5f', {
    steps: 3,
    vertexColors: true,
    rimIntensity: 0.42,
    shadowTint: '#c08468',
  });

  assert.ok(mat instanceof THREE.MeshToonMaterial);
  assert.equal(mat.vertexColors, true);
  assert.equal(mat.gradientMap, getToonGradientMap(3));
  assert.equal(mat.customProgramCacheKey(), 'anime-toon-v2');

  const uniforms = mat.userData.animeToonUniforms as AnimeToonUniforms;
  assert.ok(uniforms);
  assert.equal(uniforms.uRimIntensity.value, 0.42);
  assert.equal(
    uniforms.uShadowTintStrength.value,
    DEFAULT_ANIME_TOON_OPTIONS.shadowTintStrength,
  );

  // Verify shader injection replaces all three chunks cleanly
  const mockShader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '',
    fragmentShader:
      '#include <lights_toon_pars_fragment>\nvoid main() {\n#include <lights_fragment_begin>\n#include <opaque_fragment>\n}',
  };
  mat.onBeforeCompile(mockShader as never, {} as never);
  assert.ok(mockShader.fragmentShader.includes('uniform vec3 uShadowTint;'));
  assert.ok(mockShader.fragmentShader.includes('uniform vec3 uRimColor;'));
  assert.ok(mockShader.fragmentShader.includes('animeRimBand'));
  assert.ok(mockShader.fragmentShader.includes('animeRawShadow'));
  assert.ok(mockShader.fragmentShader.includes('animeShadowFloor'));
  assert.equal(mockShader.uniforms.uRimIntensity, uniforms.uRimIntensity);

  updateAnimeToonMaterial(mat, {
    rimIntensity: 0.15,
    shadowTintStrength: 0.5,
    rimColor: '#9efcff',
  });
  assert.equal(uniforms.uRimIntensity.value, 0.15);
  assert.equal(uniforms.uShadowTintStrength.value, 0.5);

  mat.dispose();
  disposeToonGradientMaps();
});

test('resolveAnimeToonOptions preserves defaults when omitted', () => {
  const resolved = resolveAnimeToonOptions();
  assert.equal(resolved.steps, 3);
  assert.equal(resolved.vertexColors, false);
  assert.equal(resolved.side, THREE.FrontSide);
  assert.equal(resolved.rimPower, DEFAULT_ANIME_TOON_OPTIONS.rimPower);
});

test('computeSmoothNormalsAttribute produces symmetric angle-weighted corner normals on BoxGeometry', () => {
  const box = new THREE.BoxGeometry(2, 2, 2);
  const smooth = computeSmoothNormalsAttribute(box);

  assert.equal(smooth.count, box.attributes.position.count);
  const expectedComponent = 1 / Math.sqrt(3);

  for (let i = 0; i < smooth.count; i += 1) {
    const nx = smooth.getX(i);
    const ny = smooth.getY(i);
    const nz = smooth.getZ(i);
    const len = Math.hypot(nx, ny, nz);
    assert.ok(Math.abs(len - 1) < 1e-5, `expected unit normal, got ${len}`);
    assert.ok(Math.abs(Math.abs(nx) - expectedComponent) < 1e-4);
    assert.ok(Math.abs(Math.abs(ny) - expectedComponent) < 1e-4);
    assert.ok(Math.abs(Math.abs(nz) - expectedComponent) < 1e-4);
  }

  // Calling again returns the cached BufferAttribute instance
  assert.equal(computeSmoothNormalsAttribute(box), smooth);
  box.dispose();
});

test('computeSmoothNormalsAttribute welds shared positions on non-indexed faceted geometry', () => {
  const rock = new THREE.IcosahedronGeometry(1.15, 1);
  assert.equal(rock.getIndex(), null);
  const smooth = computeSmoothNormalsAttribute(rock);
  const pos = rock.attributes.position;

  const byKey = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i += 1) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const nx = smooth.getX(i);
    const ny = smooth.getY(i);
    const nz = smooth.getZ(i);
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz));

    const prev = byKey.get(key);
    if (prev) {
      assert.ok(Math.abs(prev[0] - nx) < 1e-6);
      assert.ok(Math.abs(prev[1] - ny) < 1e-6);
      assert.ok(Math.abs(prev[2] - nz) < 1e-6);
    } else {
      byKey.set(key, [nx, ny, nz]);
    }
  }

  rock.dispose();
});

test('addInkOutline attaches BackSide plum-ink child mesh without shadows/raycast and avoids duplicates', () => {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = createAnimeToonMaterial('#7b8cde', { steps: 2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'boulder';

  const outline = addInkOutline(mesh);
  assert.equal(outline.name, 'boulder_inkOutline');
  assert.equal(outline.parent, mesh);
  assert.equal(outline.geometry, mesh.geometry);
  assert.equal(outline.castShadow, false);
  assert.equal(outline.receiveShadow, false);
  assert.equal(outline.userData.isInkOutline, true);
  assert.ok(outline.material instanceof THREE.ShaderMaterial);
  assert.equal(outline.material.side, THREE.BackSide);
  assert.equal(outline.material.fog, true);
  assert.equal(
    outline.material.uniforms.uOutlineThickness.value,
    DEFAULT_OUTLINE_THICKNESS,
  );
  assert.equal(
    '#' + outline.material.uniforms.uOutlineColor.value.getHexString(),
    DEFAULT_OUTLINE_COLOR,
  );

  // Calling raycast must be a harmless no-op
  const hits: THREE.Intersection[] = [];
  outline.raycast(new THREE.Raycaster(), hits);
  assert.equal(hits.length, 0);

  // Re-calling updates thickness/color in place instead of adding duplicate children
  const updated = addInkOutline(mesh, 0.06, '#2b1d47');
  assert.equal(updated, outline);
  assert.equal(mesh.children.length, 1);
  assert.equal(outline.material.uniforms.uOutlineThickness.value, 0.06);
  assert.equal(
    '#' + outline.material.uniforms.uOutlineColor.value.getHexString(),
    '#2b1d47',
  );

  geo.dispose();
  mat.dispose();
  outline.material.dispose();
  disposeToonGradientMaps();
});

test('addInkOutlineToGroup skips emissive cores, transparent meshes, skipInkOutline, and existing outlines', () => {
  const group = new THREE.Group();
  const solid = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    createAnimeToonMaterial('#6ccb5f'),
  );
  solid.name = 'pillar';

  const emissiveCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.3),
    createAnimeToonMaterial('#ffbe55', {
      emissive: '#ffbe55',
      emissiveIntensity: 1.8,
    }),
  );
  emissiveCore.name = 'lanternCore';

  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.4),
    createAnimeToonMaterial('#9be2ff', { transparent: true, opacity: 0.4 }),
  );
  glass.name = 'glassPane';

  const optedOut = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    createAnimeToonMaterial('#e6c29f'),
  );
  optedOut.userData.skipInkOutline = true;

  group.add(solid, emissiveCore, glass, optedOut);

  const outlines = addInkOutlineToGroup(group, 0.03);
  assert.equal(outlines.length, 1);
  assert.equal(outlines[0].name, 'pillar_inkOutline');

  // Re-running is idempotent and does not outline the outline mesh
  const secondRun = addInkOutlineToGroup(group, 0.04);
  assert.equal(secondRun.length, 1);
  assert.equal(secondRun[0], outlines[0]);
  assert.equal(solid.children.length, 1);

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  disposeToonGradientMaps();
});
