import * as THREE from 'three';
import { createAnimeToonMaterial } from './toonMaterials';

export const WORLD_SEED = 4219;
export const TERRAIN_SIZE = 300;
export const TERRAIN_HALF_SIZE = TERRAIN_SIZE / 2;
export const TERRAIN_SEGMENTS = 240;
export const TERRAIN_TEXTURE_SIZE = 2048;
export const WATER_LEVEL = -0.35;

export type TerrainBiome = 'meadow' | 'path' | 'cliff' | 'shore' | 'water';

export interface BridgeAnchor {
  position: THREE.Vector3;
  rotationY: number;
  span: number;
}

export interface CreateTerrainOptions {
  maxAnisotropy?: number;
  useBiomeTexture?: boolean;
}

/**
 * Canonical Task 07 anime valley biome palette (sRGB hex).
 */
export const BIOME_COLORS = {
  meadow: '#6ccb5f',
  meadowHigh: '#84dc68',
  meadowLush: '#52b150',
  pathSand: '#e6c29f',
  shoreSand: '#ebd0ad',
  riverbed: '#4e7d8a',
  cliffSlate: '#7b8cde',
  cliffCrevice: '#6170bf',
} as const;

export const CLIFF_SLOPE_THRESHOLD = 0.42;
export const PATH_HALF_WIDTH = 2.35;
export const SHORE_HEIGHT_BAND = 0.55;

export interface TerrainController {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  readonly geometry: THREE.PlaneGeometry;
  readonly material: THREE.MeshToonMaterial;
  readonly biomeTexture: THREE.CanvasTexture | null;
  dispose: () => void;
}

export type Noise2DFn = (x: number, y: number) => number;

// ---------------------------------------------------------------------------
// Deterministic Seeded 2D Simplex Noise
// ---------------------------------------------------------------------------

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0, 1],
  [0, -1],
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic, zero-dependency 2D Simplex noise generator in [-1, 1].
 */
export function createSimplex2D(seed: number = WORLD_SEED): Noise2DFn {
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    p[i] = i;
  }
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  return (xin: number, yin: number): number => {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;

    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = permMod12[ii + perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  };
}

function fbm2D(
  noise: Noise2DFn,
  x: number,
  y: number,
  octaves = 3,
  lacunarity = 2.05,
  gain = 0.48,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

const worldNoise = createSimplex2D(WORLD_SEED);
const detailNoise = createSimplex2D(WORLD_SEED + 7919);

// ---------------------------------------------------------------------------
// Math & Shaping Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * C1-smooth stylized terrace shaper producing clean stepped plateaus and crisp cliff risers.
 */
export function terrace(
  height: number,
  stepHeight = 4.4,
  sharpness = 3.4,
): number {
  if (stepHeight <= 0 || height <= 0) return height;
  const scaled = height / stepHeight;
  const base = Math.floor(scaled);
  const frac = scaled - base;
  const a = Math.pow(frac, sharpness);
  const b = Math.pow(1 - frac, sharpness);
  const s = a + b > 1e-12 ? a / (a + b) : frac;
  return (base + s) * stepHeight;
}

// ---------------------------------------------------------------------------
// Valley Landmarks, River Channel & Winding Footpath Definitions
// ---------------------------------------------------------------------------

const BRIDGE_Z = 18;
const BRIDGE_SPAN = 14.0;
const BRIDGE_DECK_END_Y = 0.55;

const SPAWN_X = -22;
const SPAWN_Z = 36;
const SPAWN_Y = 1.4;

const RUINS_CENTER = new THREE.Vector3(42, 11.0, -34);
const OVERLOOK_CENTER = new THREE.Vector3(-56, 16.0, -30);

function getRiverSlopeX(z: number): number {
  const dz = z - BRIDGE_Z;
  return (
    13.5 * 0.028 * Math.cos(dz * 0.028) +
    4.5 * 0.013 * Math.cos(dz * 0.013)
  );
}

/**
 * Returns the X coordinate of the sinuous river centerline at world Z.
 */
export function getRiverCenterX(z: number): number {
  const dz = z - BRIDGE_Z;
  return 13.5 * Math.sin(dz * 0.028) + 4.5 * Math.sin(dz * 0.013);
}

/**
 * Returns the half-width of the river channel at world Z, widening into a
 * tranquil mid-valley pond around z ≈ -18 while pinching cleanly at the bridge.
 */
export function getRiverHalfWidth(z: number): number {
  const baseWidth = 5.6;
  const pondFactor = Math.exp(-Math.pow((z + 18) / 16, 2));
  const bridgePinch = Math.exp(-Math.pow((z - BRIDGE_Z) / 8, 2));
  return baseWidth + pondFactor * 9.5 - bridgePinch * 0.5;
}

/**
 * Signed distance to the river/pond shoreline:
 * - `< 0` inside the river channel / pond
 * - `0` along the nominal shoreline at WATER_LEVEL
 * - `> 0` on dry riverbanks and valley meadows
 */
export function getRiverSignedDistance(x: number, z: number): number {
  const cx = getRiverCenterX(z);
  const slope = getRiverSlopeX(z);
  const perpDist = Math.abs(x - cx) / Math.sqrt(1 + slope * slope);
  return perpDist - getRiverHalfWidth(z);
}

interface PathSegment {
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  lenSq: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function sampleCatmullWaypoints(
  waypoints: ReadonlyArray<readonly [number, number, number]>,
  samplesPerSpan = 12,
): THREE.Vector3[] {
  const pts = waypoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.45);
  const totalSteps = (waypoints.length - 1) * samplesPerSpan;
  const sampled: THREE.Vector3[] = [];
  for (let i = 0; i <= totalSteps; i += 1) {
    sampled.push(curve.getPoint(i / totalSteps));
  }
  return sampled;
}

function buildPathSegments(
  waypoints: ReadonlyArray<readonly [number, number, number]>,
  samplesPerSpan = 12,
): PathSegment[] {
  const sampled = sampleCatmullWaypoints(waypoints, samplesPerSpan);

  const segments: PathSegment[] = [];
  for (let i = 0; i < sampled.length - 1; i += 1) {
    const a = sampled[i];
    const b = sampled[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq > 1e-8) {
      segments.push({
        ax: a.x,
        az: a.z,
        ay: a.y,
        bx: b.x,
        bz: b.z,
        by: b.y,
        lenSq,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minZ: Math.min(a.z, b.z),
        maxZ: Math.max(a.z, b.z),
      });
    }
  }
  return segments;
}

const bridgeSlopeAtCenter = getRiverSlopeX(BRIDGE_Z);
const bridgeDirX = 1 / Math.sqrt(1 + bridgeSlopeAtCenter * bridgeSlopeAtCenter);
const bridgeDirZ = -bridgeSlopeAtCenter * bridgeDirX;
const bridgeCenterX = getRiverCenterX(BRIDGE_Z);
const halfBridgeSpan = BRIDGE_SPAN * 0.5;

const WEST_BRIDGE_END: readonly [number, number, number] = [
  bridgeCenterX - bridgeDirX * halfBridgeSpan,
  BRIDGE_DECK_END_Y,
  BRIDGE_Z - bridgeDirZ * halfBridgeSpan,
];

const EAST_BRIDGE_END: readonly [number, number, number] = [
  bridgeCenterX + bridgeDirX * halfBridgeSpan,
  BRIDGE_DECK_END_Y,
  BRIDGE_Z + bridgeDirZ * halfBridgeSpan,
];

// West meadow path: Spawn clearing -> West bridge abutment
const WEST_TRAIL_WAYPOINTS: ReadonlyArray<readonly [number, number, number]> = [
  [-24, 1.4, 42],
  [SPAWN_X, SPAWN_Y, SPAWN_Z],
  [-16, 1.3, 28],
  [-10.5, 0.9, 23.0],
  WEST_BRIDGE_END,
];

// East ascent path: East bridge abutment -> winding hillside ramp -> Ancient Ruins plaza rim
const EAST_TRAIL_WAYPOINTS: ReadonlyArray<readonly [number, number, number]> = [
  EAST_BRIDGE_END,
  [12.5, 0.95, 12.2],
  [20.0, 2.2, 4.0],
  [24.5, 4.2, -7.0],
  [29.0, 6.9, -17.0],
  [33.5, 9.6, -24.0],
  [36.5, 11.0, -27.8],
];

// Overlook branch path: West meadow -> pond rim -> switchback -> Scenic Overlook crest rim
const OVERLOOK_TRAIL_WAYPOINTS: ReadonlyArray<readonly [number, number, number]> = [
  [-16, 1.3, 28],
  [-21.5, 1.45, 17.0],
  [-27.5, 1.65, 5.5],
  [-32.5, 2.4, -8.5],
  [-35.0, 5.2, -20.5],
  [-42.0, 10.8, -26.2],
  [-48.5, 16.0, -28.8],
];

const ALL_PATH_SEGMENTS: ReadonlyArray<PathSegment> = [
  ...buildPathSegments(WEST_TRAIL_WAYPOINTS, 10),
  ...buildPathSegments(EAST_TRAIL_WAYPOINTS, 12),
  ...buildPathSegments(OVERLOOK_TRAIL_WAYPOINTS, 12),
];

const PATH_BOUNDS = ALL_PATH_SEGMENTS.reduce(
  (acc, seg) => ({
    minX: Math.min(acc.minX, seg.minX),
    maxX: Math.max(acc.maxX, seg.maxX),
    minZ: Math.min(acc.minZ, seg.minZ),
    maxZ: Math.max(acc.maxZ, seg.maxZ),
  }),
  { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
);

function queryClosestPath(x: number, z: number): { dist: number; elevation: number } {
  // Fast far-field rejection outside the entire trail bounding box (+14 unit margin)
  if (
    x < PATH_BOUNDS.minX - 14 ||
    x > PATH_BOUNDS.maxX + 14 ||
    z < PATH_BOUNDS.minZ - 14 ||
    z > PATH_BOUNDS.maxZ + 14
  ) {
    return { dist: 50, elevation: 0 };
  }

  let minDistSq = Infinity;
  let bestElev = 0;

  for (let i = 0; i < ALL_PATH_SEGMENTS.length; i += 1) {
    const seg = ALL_PATH_SEGMENTS[i];
    if (
      x < seg.minX - 13 ||
      x > seg.maxX + 13 ||
      z < seg.minZ - 13 ||
      z > seg.maxZ + 13
    ) {
      if (minDistSq < 144) continue;
    }
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const t = clamp01(((x - seg.ax) * dx + (z - seg.az) * dz) / seg.lenSq);
    const px = seg.ax + dx * t;
    const pz = seg.az + dz * t;
    const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (dSq < minDistSq) {
      minDistSq = dSq;
      bestElev = seg.ay + (seg.by - seg.ay) * t;
    }
  }

  return { dist: Math.sqrt(minDistSq), elevation: bestElev };
}

/**
 * Returns horizontal distance in world units from `(x, z)` to the nearest winding footpath center.
 */
export function getPathDistance(x: number, z: number): number {
  return queryClosestPath(x, z).dist;
}

/**
 * Returns the canonical flat hilltop center for the Ancient Ruins Landmark (Task 14).
 */
export function getRuinsCenter(): THREE.Vector3 {
  return RUINS_CENTER.clone();
}

/**
 * Returns the canonical scenic hilltop crest center for the Wooden Overlook Deck (Task 15).
 */
export function getOverlookCenter(): THREE.Vector3 {
  return OVERLOOK_CENTER.clone();
}

/**
 * Returns the bridge anchor transform spanning the river seamlessly from bank to bank (Task 10).
 */
export function getBridgeAnchor(): BridgeAnchor {
  return {
    position: new THREE.Vector3(bridgeCenterX, BRIDGE_DECK_END_Y, BRIDGE_Z),
    rotationY: Math.atan2(bridgeSlopeAtCenter, 1),
    span: BRIDGE_SPAN,
  };
}

/**
 * Returns the open walkable spawn clearing coordinates in the south-west meadow.
 */
export function getSpawnCenter(): THREE.Vector3 {
  return new THREE.Vector3(SPAWN_X, SPAWN_Y, SPAWN_Z);
}

// ---------------------------------------------------------------------------
// Continuous Deterministic Terrain Height, Normal & Slope Queries
// ---------------------------------------------------------------------------

function focalHillWeight(
  x: number,
  z: number,
  cx: number,
  cz: number,
  innerRadius: number,
  outerRadius: number,
): number {
  const d = Math.hypot(x - cx, z - cz);
  return 1 - smoothstep(innerRadius, outerRadius, d);
}

/**
 * Pure deterministic terrain elevation query at any world `(x, z)`.
 */
export function getTerrainHeight(x: number, z: number): number {
  const cx = getRiverCenterX(z);
  const signedRiverDist = getRiverSignedDistance(x, z);

  // 1. Gentle rolling valley meadow noise
  const macroN = fbm2D(worldNoise, x * 0.0085 + 1.4, z * 0.0085 - 2.1, 3);
  const midN = fbm2D(detailNoise, x * 0.022 - 4.7, z * 0.022 + 3.2, 2);
  const meadowHeight = 1.45 + macroN * 1.1 + midN * 0.28;

  // 2. Domain-warped outer valley rim ridges with smooth rolling painterly hills (no harsh horizontal steps)
  const warpX = fbm2D(worldNoise, x * 0.014 - 3.1, z * 0.014 + 7.4, 2) * 18.0;
  const warpZ = fbm2D(detailNoise, x * 0.014 + 5.9, z * 0.014 - 2.6, 2) * 18.0;
  const radialDist = Math.hypot((x + warpX) * 0.9, (z + warpZ) * 0.86);
  const rimT = smoothstep(54, 136, radialDist);
  const corridorOpen = smoothstep(14, 38, Math.abs(x - cx));
  const rimNoise =
    0.5 + 0.5 * fbm2D(worldNoise, (x + warpX * 0.5) * 0.012 + 8.3, (z + warpZ * 0.5) * 0.012 + 5.7, 3);
  const ridgeCrest = Math.pow(rimNoise, 1.25);
  const rimRaw =
    rimT * (12.8 + ridgeCrest * 15.2 + midN * 1.6) * (0.22 + 0.78 * corridorOpen);

  // 3. Focal scenic hillside mounds centered cleanly beneath landmarks & south-east knoll
  const ruinsMound =
    focalHillWeight(x, z, RUINS_CENTER.x, RUINS_CENTER.z, 12.0, 38.0) * 10.6;
  const overlookMound =
    focalHillWeight(x, z, OVERLOOK_CENTER.x, OVERLOOK_CENTER.z, 9.0, 34.0) * 15.6;
  const eastKnoll = focalHillWeight(x, z, 58, 44, 7, 30) * 7.6;
  const westKnoll = focalHillWeight(x, z, -66, 34, 8, 32) * 8.4;
  const northRidge = focalHillWeight(x, z, 14, -92, 12, 44) * 13.5 * corridorOpen;

  // Keep gentle sculptural bluff steps on inner landmark hills while smoothing out horizontal
  // terracing bands completely on distant outer hills so the horizon rolls softly and organically
  const innerBluffs = ruinsMound + overlookMound + eastKnoll + westKnoll;
  const distantSmoothMask = smoothstep(58, 96, radialDist);
  const innerTerraceBlend =
    (0.38 + 0.14 * (0.5 + 0.5 * worldNoise(x * 0.016 - 5.2, z * 0.016 + 4.1))) *
    (1 - distantSmoothMask * 0.88);
  const smoothedInnerBluffs =
    innerBluffs > 0.05
      ? lerp(innerBluffs, terrace(innerBluffs, 5.8, 1.7), innerTerraceBlend)
      : 0;

  // Distant outer hills roll softly with zero stair-stepped horizontal bands
  const terracedHills = rimRaw + northRidge + smoothedInnerBluffs;

  // Combine central meadow with smooth rolling hillsides
  let h = meadowHeight * (1 - rimT * 0.45) + terracedHills;

  // 4. Broad, natural grassy ramp grading along walkable footpath corridors
  const pathQuery = queryClosestPath(x, z);
  const dryPathMask = smoothstep(0.8, 3.6, signedRiverDist);
  const pathGradeW = (1 - smoothstep(2.8, 11.5, pathQuery.dist)) * dryPathMask;
  if (pathGradeW > 0.001) {
    h = lerp(h, pathQuery.elevation, pathGradeW);
  }

  // 5. Flatten dedicated landmark plazas & spawn clearing cleanly after path grading
  const ruinsPlazaW = focalHillWeight(x, z, RUINS_CENTER.x, RUINS_CENTER.z, 11.5, 22.0);
  h = lerp(h, RUINS_CENTER.y, ruinsPlazaW);

  const overlookPlazaW = focalHillWeight(
    x,
    z,
    OVERLOOK_CENTER.x,
    OVERLOOK_CENTER.z,
    8.5,
    18.0,
  );
  h = lerp(h, OVERLOOK_CENTER.y, overlookPlazaW);

  const spawnW = focalHillWeight(x, z, SPAWN_X, SPAWN_Z, 8.5, 18.5);
  h = lerp(h, SPAWN_Y, spawnW);

  // 6. Carve gentle river valley floor & sinuous riverbed / tranquil pond below WATER_LEVEL
  if (signedRiverDist < 16.0) {
    const valleyAtten = 1 - smoothstep(3.0, 16.0, signedRiverDist);
    const safeCap = Math.min(h, 1.45);
    h = lerp(h, safeCap, valleyAtten * 0.85);
  }

  if (signedRiverDist < 6.0) {
    const pondFactor = Math.exp(-Math.pow((z + 18) / 16, 2));
    const fordFactor = Math.exp(-Math.pow((z - 2) / 5.5, 2));
    const bedDepth = WATER_LEVEL - 1.65 - pondFactor * 0.4 + fordFactor * 0.8;

    if (signedRiverDist >= 0) {
      const bankT = smoothstep(0, 6.0, signedRiverDist);
      const bankTarget = Math.max(0.45, h);
      h = lerp(WATER_LEVEL, bankTarget, bankT);
    } else {
      const channelT = smoothstep(0, -4.2, signedRiverDist);
      const bedMicro =
        detailNoise(x * 0.075, z * 0.075) * 0.04 * smoothstep(-0.6, -2.6, signedRiverDist);
      h = lerp(WATER_LEVEL, bedDepth + bedMicro, channelT);
    }
  }

  // 7. Ensure both bridge abutment pads sit squarely at BRIDGE_DECK_END_Y
  const westPadDist = Math.hypot(x - WEST_BRIDGE_END[0], z - WEST_BRIDGE_END[2]);
  const eastPadDist = Math.hypot(x - EAST_BRIDGE_END[0], z - EAST_BRIDGE_END[2]);
  const padW =
    Math.max(
      1 - smoothstep(1.8, 4.6, westPadDist),
      1 - smoothstep(1.8, 4.6, eastPadDist),
    ) * smoothstep(0.2, 1.5, signedRiverDist);
  if (padW > 0.001) {
    h = lerp(h, BRIDGE_DECK_END_Y, padW);
  }

  return h;
}

/**
 * Computes the unit terrain surface normal at `(x, z)` via central finite differences.
 */
export function getTerrainNormal(
  x: number,
  z: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const eps = 0.35;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);

  const dhdx = (hR - hL) / (2 * eps);
  const dhdz = (hU - hD) / (2 * eps);

  return target.set(-dhdx, 1, -dhdz).normalize();
}

const _normalScratch = new THREE.Vector3();

/**
 * Returns normalized terrain steepness in `[0, 1]` (`0 = flat`, `1 = vertical`).
 */
export function getTerrainSlope(x: number, z: number): number {
  const n = getTerrainNormal(x, z, _normalScratch);
  return Math.sqrt(Math.max(0, 1 - n.y * n.y));
}

/**
 * Classifies the primary stylized surface biome at world `(x, z)` so trees,
 * grass, wildflowers, boulders, and cliff outcrops place strictly on valid surfaces.
 * Aligned tightly with the painted regions produced by `applyBiomeVertexColors`
 * and `createTerrainBiomeTexture`.
 */
export function getTerrainBiomeAt(x: number, z: number): TerrainBiome {
  const y = getTerrainHeight(x, z);
  const riverDist = getRiverSignedDistance(x, z);
  if (y < WATER_LEVEL - 0.05 || riverDist < -0.15) {
    return 'water';
  }
  const pathDist = getPathDistance(x, z);
  if (pathDist < PATH_HALF_WIDTH && riverDist > 0.85) {
    return 'path';
  }
  if (y < WATER_LEVEL + SHORE_HEIGHT_BAND && riverDist < 3.6) {
    return 'shore';
  }
  if (riverDist < 2.2) {
    return 'shore';
  }
  const slope = getTerrainSlope(x, z);
  if (slope > CLIFF_SLOPE_THRESHOLD && riverDist > 2.8) {
    return 'cliff';
  }
  return 'meadow';
}

// ---------------------------------------------------------------------------
// Task 07: Stylized Biome Vertex Colors (Linear Space, Tight Smoothstep)
// ---------------------------------------------------------------------------

const COL_MEADOW = new THREE.Color(BIOME_COLORS.meadow);
const COL_MEADOW_HIGH = new THREE.Color(BIOME_COLORS.meadowHigh);
const COL_MEADOW_LUSH = new THREE.Color(BIOME_COLORS.meadowLush);
const COL_PATH_SAND = new THREE.Color(BIOME_COLORS.pathSand);
const COL_SHORE_SAND = new THREE.Color(BIOME_COLORS.shoreSand);
const COL_RIVERBED = new THREE.Color(BIOME_COLORS.riverbed);
const COL_CLIFF_SLATE = new THREE.Color(BIOME_COLORS.cliffSlate);
const COL_CLIFF_CREVICE = new THREE.Color(BIOME_COLORS.cliffCrevice);

const _cliffTemp = new THREE.Color();
const _shoreTemp = new THREE.Color();

/**
 * Evaluates the stylized Task 07 biome color at `(x, y, z)` in Three.js linear
 * working color space using tight smoothstep transitions so boundaries read as
 * crisp hand-painted anime brushwork.
 */
export function sampleTerrainBiomeColor(
  x: number,
  y: number,
  z: number,
  slope: number,
  target = new THREE.Color(),
): THREE.Color {
  // 1. Vibrant meadow green (#6ccb5f) with painterly chartreuse hill highlights (#84dc68)
  //    and lush emerald valley hollows (#52b150)
  const patch = 0.5 + 0.5 * worldNoise(x * 0.028 + 4.1, z * 0.028 - 6.7);
  const elevHigh = smoothstep(2.8, 14.0, y);
  const valleyHollow = 1 - smoothstep(0.6, 2.5, y);

  const lushWeight = clamp01(smoothstep(0.42, 0.16, patch) * 0.62 + valleyHollow * 0.28);
  const highWeight = clamp01(smoothstep(0.58, 0.86, patch) * 0.55 + elevHigh * 0.42);

  target.copy(COL_MEADOW);
  if (lushWeight > 0.001) {
    target.lerp(COL_MEADOW_LUSH, lushWeight);
  }
  if (highWeight > 0.001) {
    target.lerp(COL_MEADOW_HIGH, highWeight);
  }

  const riverDist = getRiverSignedDistance(x, z);
  const pathDist = getPathDistance(x, z);

  // 2. Riverbanks & pond edge: warm shoreline sand (#ebd0ad -> #e6c29f) near WATER_LEVEL ± 0.55
  //    transitioning sharply into deeper riverbed pebble-teal (#4e7d8a) underwater
  const bankProximity = 1 - smoothstep(2.0, 3.8, riverDist);
  const shoreHeightMask = 1 - smoothstep(WATER_LEVEL + 0.34, WATER_LEVEL + SHORE_HEIGHT_BAND + 0.06, y);
  const shoreMask = clamp01(Math.max(shoreHeightMask * bankProximity, 1 - smoothstep(1.65, 2.45, riverDist)));
  if (shoreMask > 0.001) {
    const warmEdgeT = 1 - smoothstep(WATER_LEVEL + 0.08, WATER_LEVEL + SHORE_HEIGHT_BAND, y);
    _shoreTemp.copy(COL_PATH_SAND).lerp(COL_SHORE_SAND, warmEdgeT);
    target.lerp(_shoreTemp, shoreMask);

    const bedMask = clamp01(
      Math.max(
        1 - smoothstep(WATER_LEVEL - 0.55, WATER_LEVEL - 0.02, y),
        1 - smoothstep(-0.65, -0.05, riverDist),
      ),
    );
    if (bedMask > 0.001) {
      target.lerp(COL_RIVERBED, bedMask);
    }
  }

  // 3. Winding sandy dirt paths (#e6c29f) connecting spawn, bridge, ruins & overlook
  const pathEdgeWobble = detailNoise(x * 0.18, z * 0.18) * 0.16;
  const pathMask =
    (1 - smoothstep(PATH_HALF_WIDTH - 0.28, PATH_HALF_WIDTH + 0.26, pathDist + pathEdgeWobble)) *
    smoothstep(0.55, 1.35, riverDist);
  if (pathMask > 0.001) {
    target.lerp(COL_PATH_SAND, pathMask);
  }

  // 4. Cool slate cliff faces (#7b8cde) with indigo-slate crevice shading (#6170bf) on steeper drops
  const cliffGuard =
    smoothstep(2.0, 3.6, riverDist) * smoothstep(PATH_HALF_WIDTH - 0.1, PATH_HALF_WIDTH + 0.85, pathDist);
  const cliffMask = smoothstep(CLIFF_SLOPE_THRESHOLD - 0.05, CLIFF_SLOPE_THRESHOLD + 0.05, slope) * cliffGuard;
  if (cliffMask > 0.001) {
    const strataWave = 0.5 + 0.5 * Math.sin(y * 1.85 + detailNoise(x * 0.06, z * 0.06) * 2.1);
    const creviceWeight = clamp01(
      smoothstep(0.56, 0.74, slope) * 0.72 + (1 - smoothstep(0.24, 0.54, strataWave)) * 0.34,
    );
    _cliffTemp.copy(COL_CLIFF_SLATE).lerp(COL_CLIFF_CREVICE, creviceWeight);
    target.lerp(_cliffTemp, cliffMask);
  }

  return target;
}

/**
 * Populates the geometry's linear `color` BufferAttribute using sharp, stylized
 * anime biome blending driven by true terrain slope, elevation, riverbanks, and paths.
 */
export function applyBiomeVertexColors(
  geometry: THREE.PlaneGeometry,
): THREE.BufferAttribute {
  const posAttr = geometry.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const temp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i += 1) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const slope = getTerrainSlope(x, z);

    sampleTerrainBiomeColor(x, y, z, slope, temp);

    colors[i * 3] = temp.r;
    colors[i * 3 + 1] = temp.g;
    colors[i * 3 + 2] = temp.b;
  }

  const colorAttr = new THREE.BufferAttribute(colors, 3);
  geometry.setAttribute('color', colorAttr);
  return colorAttr;
}

// ---------------------------------------------------------------------------
// High-Resolution Procedural Biome Texture (Eliminates Per-Vertex Pixelation)
// ---------------------------------------------------------------------------

function worldToTex(v: number, texSize: number): number {
  return ((v + TERRAIN_HALF_SIZE) / TERRAIN_SIZE) * texSize;
}

function traceRiverRibbon(
  ctx: CanvasRenderingContext2D,
  texSize: number,
  widthOffset: number,
): void {
  const stepZ = 0.5;
  const leftPts: Array<[number, number]> = [];
  const rightPts: Array<[number, number]> = [];

  for (let z = -TERRAIN_HALF_SIZE - 2; z <= TERRAIN_HALF_SIZE + 2; z += stepZ) {
    const cx = getRiverCenterX(z);
    const slope = getRiverSlopeX(z);
    const halfW = Math.max(0.4, getRiverHalfWidth(z) + widthOffset);
    const spanX = halfW * Math.sqrt(1 + slope * slope);
    const ty = worldToTex(z, texSize);
    leftPts.push([worldToTex(cx - spanX, texSize), ty]);
    rightPts.push([worldToTex(cx + spanX, texSize), ty]);
  }

  ctx.beginPath();
  ctx.moveTo(leftPts[0][0], leftPts[0][1]);
  for (let i = 1; i < leftPts.length; i += 1) {
    ctx.lineTo(leftPts[i][0], leftPts[i][1]);
  }
  for (let i = rightPts.length - 1; i >= 0; i -= 1) {
    ctx.lineTo(rightPts[i][0], rightPts[i][1]);
  }
  ctx.closePath();
}

function strokeTrailWaypoints(
  ctx: CanvasRenderingContext2D,
  waypoints: ReadonlyArray<readonly [number, number, number]>,
  texSize: number,
  worldWidth: number,
  color: string,
): void {
  const sampled = sampleCatmullWaypoints(waypoints, 18);
  const pxPerUnit = texSize / TERRAIN_SIZE;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(worldToTex(sampled[0].x, texSize), worldToTex(sampled[0].z, texSize));
  for (let i = 1; i < sampled.length; i += 1) {
    ctx.lineTo(worldToTex(sampled[i].x, texSize), worldToTex(sampled[i].z, texSize));
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = worldWidth * pxPerUnit;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/**
 * Generates a crisp 2048x2048 procedural CanvasTexture so paths, riverbanks,
 * cliff strata, and meadow brush detail render cleanly without triangle-grid pixelation.
 */
export function createTerrainBiomeTexture(
  maxAnisotropy = 8,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const texSize = TERRAIN_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = texSize;
  canvas.height = texSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. High-density 1024x1024 height/slope raster for razor-crisp cliff & meadow boundaries
  const gridN = 1024;
  const heights = new Float32Array((gridN + 1) * (gridN + 1));
  const step = TERRAIN_SIZE / gridN;
  const stride = gridN + 1;

  for (let gz = 0; gz <= gridN; gz += 1) {
    const wz = -TERRAIN_HALF_SIZE + gz * step;
    for (let gx = 0; gx <= gridN; gx += 1) {
      const wx = -TERRAIN_HALF_SIZE + gx * step;
      heights[gz * stride + gx] = getTerrainHeight(wx, wz);
    }
  }

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = gridN;
  baseCanvas.height = gridN;
  const baseCtx = baseCanvas.getContext('2d');
  if (!baseCtx) return null;

  const img = baseCtx.createImageData(gridN, gridN);
  const data = img.data;

  // Canonical Task 07 sRGB palette aligned identically with applyBiomeVertexColors
  const cLush = [82, 177, 80]; // #52b150 lush valley hollow emerald
  const cMeadow = [108, 203, 95]; // #6ccb5f vibrant Genshin meadow green
  const cSunlit = [132, 220, 104]; // #84dc68 sunlit hill chartreuse highlight
  const cCliffHighlight = [172, 184, 240]; // sunlit pastel-slate contour ledge
  const cCliffSlate = [123, 140, 222]; // #7b8cde cool slate cliff face
  const cCliffCrevice = [97, 112, 191]; // #6170bf indigo-slate crevice shading
  const cCliffRim = [148, 206, 126]; // crisp mossy transition right at cliff lip

  for (let gz = 0; gz < gridN; gz += 1) {
    const wz = -TERRAIN_HALF_SIZE + (gz + 0.5) * step;
    for (let gx = 0; gx < gridN; gx += 1) {
      const wx = -TERRAIN_HALF_SIZE + (gx + 0.5) * step;
      const idx = gz * stride + gx;
      const hC = heights[idx];
      const hR = heights[idx + 1];
      const hD = heights[(gz + 1) * stride + gx];
      const dhdx = (hR - hC) / step;
      const dhdz = (hD - hC) / step;
      const ny = 1 / Math.sqrt(1 + dhdx * dhdx + dhdz * dhdz);
      const slope = Math.sqrt(Math.max(0, 1 - ny * ny));

      const patch = 0.5 + 0.5 * worldNoise(wx * 0.028 + 4.1, wz * 0.028 - 6.7);
      const microPatch = 0.5 + 0.5 * detailNoise(wx * 0.095 - 2.3, wz * 0.095 + 5.1);
      const elevHigh = smoothstep(2.8, 14.0, hC);
      const valleyHollow = 1 - smoothstep(0.6, 2.5, hC);
      const lushWeight = clamp01(smoothstep(0.42, 0.16, patch) * 0.62 + valleyHollow * 0.28);
      const highWeight = clamp01(smoothstep(0.58, 0.86, patch) * 0.55 + elevHigh * 0.42);

      let r = lerp(cMeadow[0], cLush[0], lushWeight);
      let g = lerp(cMeadow[1], cLush[1], lushWeight);
      let b = lerp(cMeadow[2], cLush[2], lushWeight);

      r = lerp(r, cSunlit[0], highWeight);
      g = lerp(g, cSunlit[1], highWeight);
      b = lerp(b, cSunlit[2], highWeight);

      // Subtle meadow sun-dapple variation
      const dapple = (microPatch - 0.5) * 9;
      r += dapple * 0.45;
      g += dapple * 0.75;

      // Keep rolling valley hills and distant ridges lush emerald-green; only truly steep
      // rock walls show natural cool-slate stone so there are zero purple blotches on grassy slopes
      const riverDist = getRiverSignedDistance(wx, wz);
      const cliffGuard = smoothstep(2.0, 3.6, riverDist);
      const distFromCenter = Math.hypot(wx, wz);
      const distantSoftening = smoothstep(52, 100, distFromCenter);
      const rockBrush = 0.5 + 0.5 * detailNoise(wx * 0.048 + 3.7, wz * 0.048 - 2.9);
      const slopeJ = slope + detailNoise(wx * 0.12 + 2.1, wz * 0.12 - 1.7) * 0.015;

      // Raise cliff threshold smoothly so rolling grassy slopes stay vibrant emerald meadow
      const effectiveThreshold = CLIFF_SLOPE_THRESHOLD + 0.1 + distantSoftening * 0.16;

      // Soft painterly mossy rim right along true steep cliff lips
      const rimBand =
        smoothstep(effectiveThreshold - 0.07, effectiveThreshold - 0.02, slopeJ) *
        (1 - smoothstep(effectiveThreshold - 0.01, effectiveThreshold + 0.04, slopeJ)) *
        cliffGuard;
      if (rimBand > 0.001) {
        r = lerp(r, cCliffRim[0], rimBand * 0.5);
        g = lerp(g, cCliffRim[1], rimBand * 0.5);
        b = lerp(b, cCliffRim[2], rimBand * 0.5);
      }

      const cliffT =
        smoothstep(effectiveThreshold - 0.035, effectiveThreshold + 0.055, slopeJ) *
        cliffGuard;
      if (cliffT > 0.001) {
        const creviceT = clamp01(
          smoothstep(0.62, 0.8, slope) * 0.62 + (1 - rockBrush) * 0.28,
        );
        const ledgeLightT = smoothstep(0.68, 0.92, rockBrush) * (1 - creviceT * 0.65) * 0.24;

        // Muted misty limestone-slate rock tone harmonizing cleanly with our sculpted cliff slabs
        let cr = lerp(132, 102, creviceT);
        let cg = lerp(146, 114, creviceT);
        let cb = lerp(176, 144, creviceT);

        cr = lerp(cr, cCliffHighlight[0], clamp01(ledgeLightT));
        cg = lerp(cg, cCliffHighlight[1], clamp01(ledgeLightT));
        cb = lerp(cb, cCliffHighlight[2], clamp01(ledgeLightT));

        r = lerp(r, cr, cliffT);
        g = lerp(g, cg, cliffT);
        b = lerp(b, cb, cliffT);
      }

      const px = (gz * gridN + gx) * 4;
      data[px] = Math.max(0, Math.min(255, Math.round(r)));
      data[px + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[px + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[px + 3] = 255;
    }
  }
  baseCtx.putImageData(img, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(baseCanvas, 0, 0, texSize, texSize);

  // 2. Hand-painted anime meadow grass strokes (kept strictly off steep cliffs to avoid UV stretch)
  const rng = mulberry32(WORLD_SEED + 307);
  for (let i = 0; i < 7500; i += 1) {
    const wx = (rng() - 0.5) * TERRAIN_SIZE * 0.96;
    const wz = (rng() - 0.5) * TERRAIN_SIZE * 0.96;
    const riverDist = getRiverSignedDistance(wx, wz);
    if (riverDist < 2.2) continue;

    const slope = getTerrainSlope(wx, wz);
    if (slope > CLIFF_SLOPE_THRESHOLD - 0.05) continue;

    const tx = worldToTex(wx, texSize);
    const ty = worldToTex(wz, texSize);
    const len = 3 + rng() * 5.5;
    const angle = -0.35 + rng() * 0.7;
    ctx.strokeStyle =
      rng() > 0.45 ? 'rgba(132, 220, 104, 0.28)' : 'rgba(82, 177, 80, 0.20)';
    ctx.lineWidth = 1.4 + rng() * 1.4;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.sin(angle) * len, ty - Math.cos(angle) * len);
    ctx.stroke();
  }

  // 3. Crisp riverbanks: warm shoreline sand (#ebd0ad -> #e6c29f) & riverbed pebble-teal (#4e7d8a)
  traceRiverRibbon(ctx, texSize, 2.25);
  ctx.fillStyle = BIOME_COLORS.pathSand;
  ctx.fill();

  traceRiverRibbon(ctx, texSize, 1.15);
  ctx.fillStyle = BIOME_COLORS.shoreSand;
  ctx.fill();

  traceRiverRibbon(ctx, texSize, -0.15);
  ctx.fillStyle = BIOME_COLORS.riverbed;
  ctx.fill();

  traceRiverRibbon(ctx, texSize, -1.9);
  ctx.fillStyle = '#3f6b78';
  ctx.fill();

  // 4. Crisp winding warm sandy dirt footpaths (#e6c29f) aligned to PATH_HALF_WIDTH
  const trails = [
    WEST_TRAIL_WAYPOINTS,
    EAST_TRAIL_WAYPOINTS,
    OVERLOOK_TRAIL_WAYPOINTS,
  ];
  for (const trail of trails) {
    strokeTrailWaypoints(ctx, trail, texSize, PATH_HALF_WIDTH * 2.2, 'rgba(164, 152, 104, 0.34)');
    strokeTrailWaypoints(ctx, trail, texSize, PATH_HALF_WIDTH * 1.92, BIOME_COLORS.pathSand);
    strokeTrailWaypoints(ctx, trail, texSize, PATH_HALF_WIDTH * 1.05, BIOME_COLORS.shoreSand);
  }

  // Paint delicate footpath stepping pebbles & sand specks
  const pebbleRng = mulberry32(WORLD_SEED + 911);
  for (let i = 0; i < 1600; i += 1) {
    const wx = (pebbleRng() - 0.5) * 140;
    const wz = (pebbleRng() - 0.5) * 120;
    if (getPathDistance(wx, wz) > PATH_HALF_WIDTH - 0.25 || getRiverSignedDistance(wx, wz) < 1.1) {
      continue;
    }
    const tx = worldToTex(wx, texSize);
    const ty = worldToTex(wz, texSize);
    const r = 1.1 + pebbleRng() * 1.8;
    ctx.fillStyle =
      pebbleRng() > 0.5 ? 'rgba(205, 166, 128, 0.42)' : 'rgba(248, 236, 214, 0.48)';
    ctx.beginPath();
    ctx.arc(tx, ty, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle warm sand plaza pads at Ruins & Overlook centers
  const drawPlazaPad = (cx: number, cz: number, radius: number, color: string) => {
    const px = worldToTex(cx, texSize);
    const py = worldToTex(cz, texSize);
    const rPx = (radius / TERRAIN_SIZE) * texSize;
    ctx.beginPath();
    ctx.arc(px, py, rPx, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  drawPlazaPad(RUINS_CENTER.x, RUINS_CENTER.z, 7.6, 'rgba(230, 194, 159, 0.42)');
  drawPlazaPad(OVERLOOK_CENTER.x, OVERLOOK_CENTER.z, 5.2, 'rgba(230, 194, 159, 0.34)');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.max(1, Math.min(16, maxAnisotropy));
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// Analytical Upward-Lifted Anime Terrain Normals (Eliminates Black Cliff Curves)
// ---------------------------------------------------------------------------

/**
 * Computes continuous analytical terrain normals with a gentle upward anime-landscape
 * normal lift on steep slopes so curved cliffs shade smoothly with zero black creases
 * or diagonal triangle-grid sawtooth artifacts.
 */
export function computeSmoothTerrainNormals(
  geometry: THREE.PlaneGeometry,
): THREE.BufferAttribute {
  const posAttr = geometry.attributes.position;
  const normals = new Float32Array(posAttr.count * 3);
  const n = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i += 1) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    getTerrainNormal(vx, vz, n);

    // Gentle anime normal lift on cliff faces keeps shaded curves luminous & pastel
    const slope = Math.sqrt(Math.max(0, 1 - n.y * n.y));
    const lift = smoothstep(0.18, 0.65, slope) * 0.42;
    n.y += lift;
    n.normalize();

    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }

  const normAttr = new THREE.BufferAttribute(normals, 3);
  geometry.setAttribute('normal', normAttr);
  return normAttr;
}

// ---------------------------------------------------------------------------
// Terrain Mesh Factory
// ---------------------------------------------------------------------------

/**
 * Generates and adds the 300x300 stylized valley terrain mesh to `scene`.
 */
export function createTerrain(
  scene: THREE.Scene,
  options: CreateTerrainOptions = {},
): TerrainController {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i += 1) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    posAttr.setY(i, getTerrainHeight(vx, vz));
  }
  posAttr.needsUpdate = true;

  computeSmoothTerrainNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // Always populate the linear Task 07 biome vertex color attribute on the terrain mesh
  applyBiomeVertexColors(geometry);

  const biomeTexture =
    options.useBiomeTexture === false
      ? null
      : createTerrainBiomeTexture(options.maxAnisotropy ?? 8);

  // 8-stop cel ramp tuned specifically for landscapes:
  // - Texel 0 (dotNL = -1, sampled exclusively by cast shadows) = 72 for crisp grounded object shadows
  // - Texels 1..3 (dotNL in [-0.75, 0], steepest shaded cliffs) = 162 so cliff curves stay luminous slate
  // - Texels 4..5 = 210 (mid-tone slopes), Texels 6..7 = 255 (sunlit meadows & paths)
  const material = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    gradientStops: [72, 162, 162, 162, 210, 210, 255, 255],
    vertexColors: !biomeTexture,
    map: biomeTexture,
    shadowTint: '#8e88c9',
    shadowTintStrength: 0.36,
    rimColor: '#fff6dc',
    rimIntensity: 0.14,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'valleyTerrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    biomeTexture?.dispose();
  };

  return {
    mesh,
    geometry,
    material,
    biomeTexture,
    dispose,
  };
}
