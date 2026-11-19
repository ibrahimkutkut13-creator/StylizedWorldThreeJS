import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WORLD_SEED,
  createSimplex2D,
  getBridgeAnchor,
  getOverlookCenter,
  getPathDistance,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnCenter,
  getTerrainBiomeAt,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
  sampleTerrainBiomeColor,
} from './terrain';
import { createAnimeToonMaterial } from './toonMaterials';

/**
 * Canonical vibrant anime meadow grass & wildflower palette (sRGB hex).
 */
export const GRASS_COLORS = {
  rootEmerald: '#248f42',
  midMeadow: '#52c946',
  sunlitLime: '#b8f24d',
  lavenderDeep: '#5822d6',
  lavenderBright: '#8240ff',
  pinkWildflower: '#ff4eb8',
  pinkSoft: '#ff7ed0',
  goldenBlossom: '#ffd91a',
  goldenWarm: '#ffa800',
} as const;

export interface GrassStats {
  readonly grassTufts: number;
  readonly grassBlades: number;
  readonly lavenderClusters: number;
  readonly pinkFlowerClusters: number;
  readonly goldenFlowerClusters: number;
  readonly totalFlowers: number;
}

export interface GrassController {
  readonly root: THREE.Group;
  readonly stats: GrassStats;
  readonly windUniforms: {
    uWindTime: { value: number };
    uWindStrength: { value: number };
  };
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

export interface CreateGrassOptions {
  /** Target instanced 3-blade grass tuft count (default 32,000 tufts = 96,000 individual blades, with doubled foreground density). */
  tuftCount?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeForMerge(
  geo: THREE.BufferGeometry,
  keepColor = true,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.getAttribute('normal')) {
    g.computeVertexNormals();
  }
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal' && !(keepColor && key === 'color')) {
      g.deleteAttribute(key);
    }
  }
  return g;
}

function mergeColoredParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((p) => normalizeForMerge(p, true));
  const merged = mergeGeometries(normalized, false);
  normalized.forEach((p) => p.dispose());
  parts.forEach((p) => p.dispose());
  if (!merged) {
    throw new Error('Failed to merge procedural meadow grass/flower geometries');
  }
  return merged;
}

function paintGeometrySolid(
  geo: THREE.BufferGeometry,
  hex: string,
  upwardNormal = true,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < pos.count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (upwardNormal) {
    const norms = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      norms[i * 3] = 0;
      norms[i * 3 + 1] = 1;
      norms[i * 3 + 2] = 0;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  } else {
    g.computeVertexNormals();
  }
  return g;
}

// ---------------------------------------------------------------------------
// 1. Soft, Thin, Tall 3-Segment Curved Grass Tuft Geometry (Seamless Base)
// ---------------------------------------------------------------------------

/**
 * Builds a soft, painterly 3-blade meadow grass tuft pivoted cleanly at y = 0:
 * - 3x thinner (~0.046 base width), taller (~0.95-1.15 height) delicate wisps
 * - Segmented into 3 vertical segments with a graceful parabolic arch and gentle tip droop
 * - Base vertex color is pure white (#ffffff) so `vertexColor * instanceColor` matches the
 *   exact sampled ground color underneath with zero harsh triangle seams, warming smoothly
 *   into sunlit lime-chartreuse toward the drooping tips.
 */
export function createLushGrassTuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const specs = [
    { angle: 0.08, lean: 0.34, droop: 0.06, h: 1.12, w: 0.048, offset: 0.065 },
    { angle: 2.18, lean: 0.38, droop: 0.075, h: 0.96, w: 0.044, offset: 0.075 },
    { angle: 4.26, lean: 0.31, droop: 0.055, h: 1.04, w: 0.046, offset: 0.07 },
  ];

  // Root = pure white (#ffffff) so blade base equals the EXACT terrain color underneath!
  // Mid/Tip gently lift into warm sunlit lime-emerald without dark seams at the ground.
  const c0 = new THREE.Color('#ffffff');
  const c1 = new THREE.Color('#f7ffec');
  const c2 = new THREE.Color('#ebffc2');
  const c3 = new THREE.Color('#e2ff88');

  const segColors = [c0, c1, c2, c3];
  // 3 vertical segments (4 height rings: root -> lower-mid -> upper-mid -> gently drooping tip)
  const heightStops = [0.0, 0.36, 0.72, 1.0];
  const widthMults = [1.0, 0.78, 0.44, 0.0];
  const leanMults = [0.0, 0.14, 0.48, 1.0];
  const droopMults = [0.0, 0.0, 0.18, 1.0];

  for (const s of specs) {
    const cosA = Math.cos(s.angle);
    const sinA = Math.sin(s.angle);
    const ox = cosA * s.offset;
    const oz = sinA * s.offset;
    const tx = -sinA * s.w * 0.5;
    const tz = cosA * s.w * 0.5;

    const ringCenter = (idx: number): [number, number, number] => {
      const rx = ox + cosA * s.lean * leanMults[idx];
      const rz = oz + sinA * s.lean * leanMults[idx];
      const ry = s.h * heightStops[idx] - s.droop * droopMults[idx];
      return [rx, ry, rz];
    };

    const p0 = ringCenter(0);
    const p1 = ringCenter(1);
    const p2 = ringCenter(2);
    const p3 = ringCenter(3);

    const w0 = widthMults[0];
    const w1 = widthMults[1];
    const w2 = widthMults[2];

    // 3 vertical segments = 2 tapered arched quads + 1 slender curved tip triangle (15 verts)
    const verts = new Float32Array([
      // Segment 1 (root -> 36% height)
      p0[0] - tx * w0, p0[1], p0[2] - tz * w0,
      p0[0] + tx * w0, p0[1], p0[2] + tz * w0,
      p1[0] + tx * w1, p1[1], p1[2] + tz * w1,

      p0[0] - tx * w0, p0[1], p0[2] - tz * w0,
      p1[0] + tx * w1, p1[1], p1[2] + tz * w1,
      p1[0] - tx * w1, p1[1], p1[2] - tz * w1,

      // Segment 2 (36% -> 72% height)
      p1[0] - tx * w1, p1[1], p1[2] - tz * w1,
      p1[0] + tx * w1, p1[1], p1[2] + tz * w1,
      p2[0] + tx * w2, p2[1], p2[2] + tz * w2,

      p1[0] - tx * w1, p1[1], p1[2] - tz * w1,
      p2[0] + tx * w2, p2[1], p2[2] + tz * w2,
      p2[0] - tx * w2, p2[1], p2[2] - tz * w2,

      // Segment 3 (72% -> 100% gently drooping tip)
      p2[0] - tx * w2, p2[1], p2[2] - tz * w2,
      p2[0] + tx * w2, p2[1], p2[2] + tz * w2,
      p3[0], p3[1], p3[2],
    ]);

    const vColList = [
      segColors[0], segColors[0], segColors[1],
      segColors[0], segColors[1], segColors[1],
      segColors[1], segColors[1], segColors[2],
      segColors[1], segColors[2], segColors[2],
      segColors[2], segColors[2], segColors[3],
    ];
    const colors = new Float32Array(vColList.length * 3);
    for (let i = 0; i < vColList.length; i += 1) {
      colors[i * 3] = vColList[i].r;
      colors[i * 3 + 1] = vColList[i].g;
      colors[i * 3 + 2] = vColList[i].b;
    }

    // Pure upward terrain-matched normals at root transitioning to soft sunlit upward tilt at tips
    const vNormWeights = [0, 0, 0.05, 0, 0.05, 0.05, 0.05, 0.05, 0.1, 0.05, 0.1, 0.1, 0.1, 0.1, 0.14];
    const norms = new Float32Array(verts.length);
    for (let i = 0; i < vNormWeights.length; i += 1) {
      const tilt = vNormWeights[i];
      const nx = cosA * tilt;
      const ny = 1.0;
      const nz = sinA * tilt;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      norms[i * 3] = nx * invLen;
      norms[i * 3 + 1] = ny * invLen;
      norms[i * 3 + 2] = nz * invLen;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    blades.push(g);
  }

  return mergeColoredParts(blades);
}

// ---------------------------------------------------------------------------
// 2. Sculpted Wildflower Geometries (Lavender Spikes, Pink & Golden Blossoms)
// ---------------------------------------------------------------------------

/**
 * Tall upright purple lavender spike cluster (3 slender floral spires per instance)
 * matching the iconic foreground lavender accents in anime meadows.
 */
export function createLavenderSpikeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stalks = [
    { x: 0.0, z: 0.0, h: 0.96, leanX: 0.03, leanZ: 0.02, r: 0.044 },
    { x: 0.12, z: 0.08, h: 0.84, leanX: 0.08, leanZ: 0.04, r: 0.04 },
    { x: -0.11, z: -0.06, h: 0.78, leanX: -0.07, leanZ: -0.04, r: 0.038 },
  ];

  for (const s of stalks) {
    // Slender emerald stem
    const stemH = s.h * 0.46;
    const stem = new THREE.CylinderGeometry(0.013, 0.018, stemH, 4);
    stem.translate(s.x, stemH * 0.5, s.z);
    parts.push(paintGeometrySolid(stem, '#3c9e44', true));

    // Slender, richly colored multi-tier lavender floral spire
    const lowerSpike = new THREE.ConeGeometry(s.r, s.h * 0.4, 5);
    lowerSpike.translate(s.x + s.leanX * 0.4, stemH + s.h * 0.16, s.z + s.leanZ * 0.4);
    parts.push(paintGeometrySolid(lowerSpike, '#8856ff', true));

    const upperSpike = new THREE.ConeGeometry(s.r * 0.72, s.h * 0.34, 5);
    upperSpike.translate(s.x + s.leanX * 0.72, stemH + s.h * 0.36, s.z + s.leanZ * 0.72);
    parts.push(paintGeometrySolid(upperSpike, '#ba94ff', true));
  }

  return mergeColoredParts(parts);
}

/**
 * Dense luminous pink wildflower cluster (5 delicate upturned blossoms with warm golden hearts).
 */
export function createPinkWildflowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const heads: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.0, 0.4, 0.0, 0.115],
    [0.18, 0.35, 0.11, 0.1],
    [-0.17, 0.36, 0.09, 0.095],
    [0.07, 0.33, -0.17, 0.095],
    [-0.14, 0.32, -0.13, 0.09],
  ];

  for (const [x, y, z, r] of heads) {
    const stem = new THREE.CylinderGeometry(0.012, 0.016, y, 4);
    stem.translate(x, y * 0.5, z);
    parts.push(paintGeometrySolid(stem, '#44ab4c', true));

    // Crisp delicate petal crown
    const petals = new THREE.CylinderGeometry(r, r * 0.45, r * 0.36, 5);
    petals.translate(x, y, z);
    parts.push(paintGeometrySolid(petals, '#ffffff', true));

    // Sunny warm blossom center
    const center = new THREE.IcosahedronGeometry(r * 0.32, 0);
    center.scale(1, 0.55, 1);
    center.translate(x, y + r * 0.2, z);
    parts.push(paintGeometrySolid(center, '#ffe052', true));
  }

  return mergeColoredParts(parts);
}

/**
 * Bright sunlit golden-yellow blossom spray (6 delicate buttercup-gold flowers per clump).
 */
export function createGoldenBlossomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const heads: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.0, 0.42, 0.0, 0.095],
    [0.16, 0.36, 0.1, 0.085],
    [-0.15, 0.37, 0.08, 0.085],
    [0.1, 0.35, -0.15, 0.08],
    [-0.12, 0.34, -0.13, 0.078],
    [0.02, 0.33, 0.17, 0.075],
  ];

  for (const [x, y, z, r] of heads) {
    const stem = new THREE.CylinderGeometry(0.012, 0.016, y, 4);
    stem.translate(x, y * 0.5, z);
    parts.push(paintGeometrySolid(stem, '#46b04a', true));

    const blossom = new THREE.IcosahedronGeometry(r, 0);
    blossom.scale(1.12, 0.55, 1.12);
    blossom.translate(x, y, z);
    parts.push(paintGeometrySolid(blossom, '#ffffff', true));
  }

  return mergeColoredParts(parts);
}

// ---------------------------------------------------------------------------
// 3. Rolling Anime Meadow Wind Shader (onBeforeCompile)
// ---------------------------------------------------------------------------

interface MeadowWindUniforms {
  uWindTime: { value: number };
  uWindStrength: { value: number };
}

const MEADOW_WIND_PARS = /* glsl */ `
#include <common>
uniform float uWindTime;
uniform float uWindStrength;
`;

const MEADOW_WIND_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  vec2 instXZ = vec2( 0.0 );
  #ifdef USE_INSTANCING
    instXZ = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
  #endif
  float tipWeight = clamp( position.y * 0.96, 0.0, 1.2 );
  float swayTip = tipWeight * tipWeight;
  float gustPhase = instXZ.x * 0.12 + instXZ.y * 0.095 - uWindTime * 1.95;
  float gust = sin( gustPhase ) + 0.36 * sin( gustPhase * 2.0 + 1.3 );
  float flutter = sin( uWindTime * 3.4 + instXZ.x * 0.65 + instXZ.y * 0.52 ) * 0.025;
  float disp = ( gust * 0.16 + flutter ) * uWindStrength * swayTip;
  transformed.x += disp * 0.86;
  transformed.z += disp * 0.51;
  // Subtle natural bend-down as the tall slender tip leans in the breeze
  transformed.y -= abs( disp ) * 0.14 * tipWeight;
}
`;

function attachMeadowWindShader(
  material: THREE.MeshToonMaterial,
  windUniforms: MeadowWindUniforms,
  cacheTag: string,
): void {
  const prevCompile = material.onBeforeCompile.bind(material);
  const prevCacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${prevCacheKey()}-${cacheTag}`;
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile(shader, renderer);
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', MEADOW_WIND_PARS)
      .replace('#include <begin_vertex>', MEADOW_WIND_VERTEX);
  };
  material.userData.meadowWindUniforms = windUniforms;
}

// ---------------------------------------------------------------------------
// 4. High-Density Meadow Grass (64,500+ Blades) & Clustered Wildflower Scatter
// ---------------------------------------------------------------------------

/**
 * Populates all green meadow slopes of Azure Vale with 64,500+ instanced grass blades
 * (21,500 3-blade curved tufts) with lime-to-emerald shading, crisp shadow reception,
 * rolling wind waves, and dense clusters of tall purple lavender spikes, bright pink
 * wildflowers, and golden-yellow blossoms.
 */
export function createGrass(
  scene: THREE.Scene,
  options: CreateGrassOptions = {},
): GrassController {
  const root = new THREE.Group();
  root.name = 'lushAnimeMeadowGrass';
  scene.add(root);

  const targetTufts = Math.max(20000, options.tuftCount ?? 32000);
  const windUniforms: MeadowWindUniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1.0 },
  };

  const ruins = getRuinsCenter();
  const bridge = getBridgeAnchor();
  const overlook = getOverlookCenter();
  const spawn = getSpawnCenter();
  const patchNoise = createSimplex2D(WORLD_SEED + 613);
  const dummy = new THREE.Object3D();
  const tempColor = new THREE.Color();
  const slopeNormal = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const alignQuat = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();

  const isValidMeadowSpot = (x: number, z: number, maxSlope: number): boolean => {
    if (getTerrainBiomeAt(x, z) !== 'meadow') return false;
    if (getTerrainSlope(x, z) > maxSlope) return false;
    if (getPathDistance(x, z) < 2.55) return false;
    if (getRiverSignedDistance(x, z) < 1.35) return false;
    if (Math.hypot(x - ruins.x, z - ruins.z) < 9.5) return false;
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 5.5) return false;
    if (Math.hypot(x - overlook.x - 5.2, z - overlook.z - 1.2) < 5.2) return false;
    return true;
  };

  // 1. Ultra-Lush Instanced Meadow Grass (32,000 tufts * 3 slender curved blades = 96,000+ blades)
  // Match terrain cel-ramp & shadow tint identically so blade bases melt seamlessly into the ground.
  const grassGeo = createLushGrassTuftGeometry();
  const grassMat = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    side: THREE.DoubleSide,
    gradientStops: [72, 162, 162, 162, 210, 210, 255, 255],
    shadowTint: '#8e88c9',
    shadowTintStrength: 0.36,
    rimColor: '#f0ffaa',
    rimPower: 5.5,
    rimIntensity: 0.06,
  });
  attachMeadowWindShader(grassMat, windUniforms, 'meadow-grass-wind-v2');

  const grassRng = mulberry32(WORLD_SEED + 901);
  const grassMatrices: THREE.Matrix4[] = [];
  const grassColors: THREE.Color[] = [];

  const pushGrassTuft = (x: number, z: number, heightBoost = 0): void => {
    const y = getTerrainHeight(x, z);
    const slope = getTerrainSlope(x, z);
    getTerrainNormal(x, z, slopeNormal);

    // Orient tuft base cleanly to terrain normal so base lighting matches ground pixel-for-pixel
    alignQuat.setFromUnitVectors(upAxis, slopeNormal);
    yawQuat.setFromAxisAngle(upAxis, grassRng() * Math.PI * 2);
    dummy.quaternion.copy(alignQuat).multiply(yawQuat);

    const clump = patchNoise(x * 0.045, z * 0.045);
    const scaleXZ = 0.85 + grassRng() * 0.55;
    const scaleY = 0.78 + grassRng() * 0.52 + Math.max(0, clump) * 0.18 + heightBoost;

    dummy.position.set(x, y - 0.04, z);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    grassMatrices.push(dummy.matrix.clone());

    // Sample the EXACT terrain biome color underneath so blade bases blend invisibly into the meadow
    sampleTerrainBiomeColor(x, y, z, slope, tempColor);
    grassColors.push(tempColor.clone());
  };

  // Tier A: Doubled foreground density right across the hero meadow glade, spawn meadow & valley foreground
  const heroGladeQuota = Math.floor(targetTufts * 0.22);
  for (let attempt = 0; attempt < heroGladeQuota * 5 && grassMatrices.length < heroGladeQuota; attempt += 1) {
    const x = 4 + grassRng() * 38;
    const z = 4 + grassRng() * 34;
    if (!isValidMeadowSpot(x, z, 0.36)) continue;
    pushGrassTuft(x, z, 0.06);
  }

  // Tier B: High-density playable valley foreground/midground carpet ([-68..68])
  const foregroundTarget = Math.floor(targetTufts * 0.62);
  for (let attempt = 0; attempt < targetTufts * 4 && grassMatrices.length < foregroundTarget; attempt += 1) {
    const x = (grassRng() - 0.5) * 136;
    const z = (grassRng() - 0.5) * 136;
    if (!isValidMeadowSpot(x, z, 0.37)) continue;
    const clump = patchNoise(x * 0.045, z * 0.045);
    if (clump < -0.62 && grassRng() > 0.5) continue;
    pushGrassTuft(x, z, 0.02);
  }

  // Tier C: Sweeping outer meadow slopes & rolling hillsides ([-128..128])
  const maxOuterAttempts = targetTufts * 4;
  for (let attempt = 0; attempt < maxOuterAttempts && grassMatrices.length < targetTufts; attempt += 1) {
    const x = (grassRng() - 0.5) * 256;
    const z = (grassRng() - 0.5) * 256;
    if (!isValidMeadowSpot(x, z, 0.37)) continue;
    const clump = patchNoise(x * 0.045, z * 0.045);
    if (clump < -0.58 && grassRng() > 0.45) continue;
    pushGrassTuft(x, z, 0);
  }

  const grassMesh = new THREE.InstancedMesh(
    grassGeo,
    grassMat,
    Math.max(1, grassMatrices.length),
  );
  grassMesh.name = 'denseMeadowGrassBlades';
  grassMesh.castShadow = false;
  grassMesh.receiveShadow = true;
  for (let i = 0; i < grassMatrices.length; i += 1) {
    grassMesh.setMatrixAt(i, grassMatrices[i]);
    grassMesh.setColorAt(i, grassColors[i]);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  root.add(grassMesh);

  // 2. Dense Wildflower Clusters: Tall Purple Lavender, Pink Wildflowers & Golden Blossoms
  const flowerMat = createAnimeToonMaterial('#ffffff', {
    steps: 2,
    vertexColors: true,
    gradientStops: [180, 255],
    emissive: '#fff2cc',
    emissiveIntensity: 0.05,
    rimColor: '#fffbe0',
    rimPower: 4.0,
    rimIntensity: 0.16,
  });
  attachMeadowWindShader(flowerMat, windUniforms, 'meadow-flowers-wind-v2');

  const buildFlowerSpecies = (
    name: string,
    geometry: THREE.BufferGeometry,
    paletteHex: readonly string[],
    seedOffset: number,
    targetCount: number,
    noiseOffsetX: number,
    noiseOffsetZ: number,
    heroAnchors: ReadonlyArray<readonly [number, number, number]>,
    scaleMin: number,
    scaleMax: number,
  ): number => {
    const rng = mulberry32(WORLD_SEED + seedOffset);
    const palette = paletteHex.map((hex) => new THREE.Color(hex));
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];

    // Seed natural spaced flower drifts in the hero meadow so lush green grass & shadows breathe cleanly
    for (const [ax, az, radius] of heroAnchors) {
      const patchQuota = Math.min(14, Math.floor(targetCount * 0.02));
      for (let k = 0; k < patchQuota * 3 && matrices.length < targetCount; k += 1) {
        const angle = rng() * Math.PI * 2;
        const dist = Math.sqrt(rng()) * radius;
        const x = ax + Math.cos(angle) * dist;
        const z = az + Math.sin(angle) * dist;
        if (!isValidMeadowSpot(x, z, 0.34)) continue;

        const y = getTerrainHeight(x, z);
        const s = scaleMin + rng() * (scaleMax - scaleMin);
        dummy.position.set(x, y - 0.03, z);
        dummy.rotation.set(
          (rng() - 0.5) * 0.14,
          rng() * Math.PI * 2,
          (rng() - 0.5) * 0.14,
        );
        dummy.scale.set(s, s * (0.9 + rng() * 0.28), s);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(palette[Math.floor(rng() * palette.length)]);
      }
    }

    // Scatter organic noise-clumped flower drifts across the entire meadow valley
    for (let attempt = 0; attempt < targetCount * 8 && matrices.length < targetCount; attempt += 1) {
      const cx = (rng() - 0.5) * 185;
      const cz = (rng() - 0.5) * 185;
      const patch = patchNoise(cx * 0.068 + noiseOffsetX, cz * 0.068 + noiseOffsetZ);
      const nearSpawnOrHero = Math.hypot(cx - spawn.x, cz - spawn.z) < 28 ? 0.24 : 0;
      if (patch + nearSpawnOrHero < 0.18) continue;
      if (!isValidMeadowSpot(cx, cz, 0.33)) continue;

      // Spawn a tight bouquet cluster of 3–6 tufts so flowers read as lush drifts, never lonely dots
      const clumpCount = 3 + Math.floor(rng() * 4);
      for (let b = 0; b < clumpCount && matrices.length < targetCount; b += 1) {
        const ang = rng() * Math.PI * 2;
        const r = b === 0 ? 0 : 0.35 + rng() * 1.45;
        const x = cx + Math.cos(ang) * r;
        const z = cz + Math.sin(ang) * r;
        if (!isValidMeadowSpot(x, z, 0.34)) continue;

        const y = getTerrainHeight(x, z);
        const s = scaleMin + rng() * (scaleMax - scaleMin);
        dummy.position.set(x, y - 0.03, z);
        dummy.rotation.set(
          (rng() - 0.5) * 0.14,
          rng() * Math.PI * 2,
          (rng() - 0.5) * 0.14,
        );
        dummy.scale.set(s, s * (0.88 + rng() * 0.3), s);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(palette[Math.floor(rng() * palette.length)]);
      }
    }

    const mesh = new THREE.InstancedMesh(geometry, flowerMat, Math.max(1, matrices.length));
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    for (let i = 0; i < matrices.length; i += 1) {
      mesh.setMatrixAt(i, matrices[i]);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    return matrices.length;
  };

  // Spaced, painterly foreground flower patches echoing the reference meadow rhythm
  const lavenderAnchors: ReadonlyArray<readonly [number, number, number]> = [
    [16.2, 23.5, 3.6],
    [26.5, 25.2, 3.8],
    [19.5, 19.2, 3.2],
    [29.8, 17.5, 4.2],
    [-12, 18, 5.5],
    [-18, -2, 5.5],
    [12, 4, 4.8],
    [24, -18, 5.2],
  ];

  const pinkAnchors: ReadonlyArray<readonly [number, number, number]> = [
    [23.8, 22.8, 3.4],
    [14.2, 18.5, 3.2],
    [27.5, 12.2, 4.0],
    [21.2, 26.8, 3.4],
    [-8, 22, 5.2],
    [-16, -12, 5.5],
    [28, -24, 5.5],
    [15, -6, 4.5],
  ];

  const goldenAnchors: ReadonlyArray<readonly [number, number, number]> = [
    [19.2, 25.2, 3.4],
    [26.8, 21.5, 3.2],
    [15.5, 14.5, 3.5],
    [24.5, 9.5, 4.2],
    [-14, 24, 5.2],
    [-22, 8, 5.2],
    [14, 10, 4.8],
    [32, -16, 5.2],
  ];

  const lavenderClusters = buildFlowerSpecies(
    'tallPurpleLavenderSpikes',
    createLavenderSpikeGeometry(),
    [GRASS_COLORS.lavenderDeep, GRASS_COLORS.lavenderBright, '#662ae6', '#945cff'],
    1013,
    1150,
    4.5,
    -7.2,
    lavenderAnchors,
    0.72,
    1.08,
  );

  const pinkFlowerClusters = buildFlowerSpecies(
    'pinkMeadowWildflowers',
    createPinkWildflowerGeometry(),
    [GRASS_COLORS.pinkWildflower, GRASS_COLORS.pinkSoft, '#ff38aa', '#ff8ad6'],
    1151,
    1050,
    -8.4,
    5.6,
    pinkAnchors,
    0.66,
    1.02,
  );

  const goldenFlowerClusters = buildFlowerSpecies(
    'goldenYellowBlossoms',
    createGoldenBlossomGeometry(),
    [GRASS_COLORS.goldenBlossom, GRASS_COLORS.goldenWarm, '#ffe200', '#ffbe0b'],
    1297,
    1050,
    12.1,
    9.3,
    goldenAnchors,
    0.64,
    0.98,
  );

  const update = (_dt: number, elapsed: number): void => {
    windUniforms.uWindTime.value = elapsed;
  };

  const dispose = (): void => {
    scene.remove(root);
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && !disposedMats.has(m)) {
            disposedMats.add(m);
            m.dispose();
          }
        }
      }
    });
  };

  return {
    root,
    stats: {
      grassTufts: grassMatrices.length,
      grassBlades: grassMatrices.length * 3,
      lavenderClusters,
      pinkFlowerClusters,
      goldenFlowerClusters,
      totalFlowers: lavenderClusters + pinkFlowerClusters + goldenFlowerClusters,
    },
    windUniforms,
    update,
    dispose,
  };
}
