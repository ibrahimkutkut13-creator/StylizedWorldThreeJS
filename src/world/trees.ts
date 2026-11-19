import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WORLD_SEED,
  getBridgeAnchor,
  getOverlookCenter,
  getPathDistance,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnCenter,
  getTerrainBiomeAt,
  getTerrainHeight,
  getTerrainSlope,
} from './terrain';
import { createAnimeToonMaterial } from './toonMaterials';

/**
 * Canonical vibrant anime tree palette matching high-end painterly Genshin Impact meadows:
 * - Deep Teal-Emerald wide crowns
 * - Pastel Sakura Pink tall billowing clouds
 * - Warm Golden-Amber sunlit crowns
 * - Natural mossy-base bark & feathery root shrubs (zero heavy black outlines)
 */
export const TREE_COLORS = {
  trunkBark: '#63412c',
  deepTealCore: '#053b3e',
  deepTealMid: '#0f8c54',
  deepTealTip: '#54e064',
  sakuraShadow: '#8c62bf',
  sakuraPink: '#ff96dc',
  sakuraHighlight: '#ffe0f5',
  amberShadow: '#a84700',
  goldenAmber: '#ff9e08',
  goldenSun: '#ffe61a',
  mossShrubDark: '#0f5c3e',
  mossShrubSun: '#7ae842',
} as const;

export type TreeArchetypeKind = 'deepTeal' | 'pastelSakura' | 'goldenAmber';
export type LeafTextureVariant = 'featheryFrond' | 'sakuraSpray' | 'goldenSprig';

export interface TreeCollider {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly archetype: TreeArchetypeKind;
}

export interface CreateTreesOptions {
  /** Normalized world-space sun direction for warm sun-facing canopy top rim-glow. */
  sunDirection?: THREE.Vector3;
}

export interface TreesStats {
  readonly deepTeal: number;
  readonly pastelSakura: number;
  readonly goldenAmber: number;
  readonly mossyShrubs: number;
  readonly ridgeTrees: number;
  readonly totalTrees: number;
  readonly colliders: number;
  readonly cardsPerArchetype: Record<TreeArchetypeKind, number>;
}

export interface TreesController {
  readonly root: THREE.Group;
  readonly colliders: readonly TreeCollider[];
  readonly stats: TreesStats;
  readonly windUniforms: {
    uWindTime: { value: number };
    uWindStrength: { value: number };
    uWindDirection: { value: THREE.Vector2 };
  };
  setWindStrength: (strength: number) => void;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
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
  keepColor = false,
  keepUv = false,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.getAttribute('normal')) {
    g.computeVertexNormals();
  }
  for (const key of Object.keys(g.attributes)) {
    if (
      key !== 'position' &&
      key !== 'normal' &&
      !(keepColor && key === 'color') &&
      !(keepUv && key === 'uv')
    ) {
      g.deleteAttribute(key);
    }
  }
  return g;
}

function mergeParts(
  parts: THREE.BufferGeometry[],
  keepColor = false,
  keepUv = false,
): THREE.BufferGeometry {
  const normalized = parts.map((p) => normalizeForMerge(p, keepColor, keepUv));
  const merged = mergeGeometries(normalized, false);
  normalized.forEach((p) => p.dispose());
  parts.forEach((p) => p.dispose());
  if (!merged) {
    throw new Error('Failed to merge procedural tree geometries');
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 1. Soft, Multi-Layered Painterly Botanical Leaf-Cluster Canvas Textures
// ---------------------------------------------------------------------------

/**
 * Draws a plump, rounded painterly botanical leaf with soft inner shadow depth
 * and an off-center sunlit lobe highlight (zero spiky/needle silhouettes).
 */
function drawRoundedBotanicalLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
  baseColor: string,
  shadowColor: string,
  highlightColor?: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Subtle soft drop-shadow behind each leaf to build lush inner shadow depth
  ctx.beginPath();
  ctx.ellipse(2.5, 4.0, rx * 1.02, ry * 0.96, 0, 0, Math.PI * 2);
  ctx.fillStyle = shadowColor;
  ctx.fill();

  // Main rounded plump organic leaf body (soft oval/obovate silhouette)
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo(rx * 0.92, -ry * 0.96, rx * 1.08, ry * 0.32, 0, ry);
  ctx.bezierCurveTo(-rx * 1.08, ry * 0.32, -rx * 0.92, -ry * 0.96, 0, -ry);
  ctx.closePath();
  ctx.fillStyle = baseColor;
  ctx.fill();

  // Soft sunlit upper-lobe brushstroke
  if (highlightColor) {
    ctx.beginPath();
    ctx.ellipse(-rx * 0.14, -ry * 0.22, rx * 0.56, ry * 0.48, -0.25, 0, Math.PI * 2);
    ctx.fillStyle = highlightColor;
    ctx.fill();
  }

  ctx.restore();
}

function drawPillowySakuraPuff(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rot: number,
  petalColor: string,
  shadowColor: string,
  highlightColor: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  // Soft cloudy shadow cushion underneath the blossom rosette
  ctx.beginPath();
  ctx.arc(2.5, 3.5, radius * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = shadowColor;
  ctx.fill();

  // 5 plump overlapping rounded cherry petals
  for (let p = 0; p < 5; p += 1) {
    const a = (p / 5) * Math.PI * 2;
    const px = Math.cos(a) * radius * 0.46;
    const py = Math.sin(a) * radius * 0.46;
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.54, 0, Math.PI * 2);
    ctx.fillStyle = petalColor;
    ctx.fill();
  }

  // Sunlit soft cloud highlight toward top-left of each rosette
  ctx.beginPath();
  ctx.arc(-radius * 0.16, -radius * 0.2, radius * 0.44, 0, Math.PI * 2);
  ctx.fillStyle = highlightColor;
  ctx.fill();

  ctx.restore();
}

/**
 * Generates a soft, multi-layered 512x512 botanical leaf-cluster alpha-cutout texture
 * (`alphaTest: 0.4`) composed of 95-115 tiny overlapping rounded leaves with baked soft
 * inner shadow depth and sunlit outer scalloped cloud rims. Uses CanvasTexture in the
 * browser and a deterministic RGBA DataTexture in headless Node unit tests.
 */
export function createLeafClusterTexture(
  variant: LeafTextureVariant,
): THREE.Texture {
  const size = 512;

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      const seedOffset =
        variant === 'featheryFrond' ? 7703 : variant === 'sakuraSpray' ? 8801 : 9907;
      const rng = mulberry32(WORLD_SEED + seedOffset);
      const half = size * 0.5;

      const palette =
        variant === 'featheryFrond'
          ? {
              coreDeep: '#567c72',
              coreShadow: 'rgba(26, 58, 54, 0.78)',
              midDark: '#7ca89a',
              midShadow: 'rgba(42, 82, 72, 0.58)',
              midBright: '#b8dec8',
              midHigh: '#d8f2e0',
              outerMain: '#e4f8ea',
              outerHigh: '#f8fff9',
            }
          : variant === 'sakuraSpray'
            ? {
                coreDeep: '#9e80b8',
                coreShadow: 'rgba(104, 72, 136, 0.72)',
                midDark: '#c6abd8',
                midShadow: 'rgba(132, 96, 162, 0.52)',
                midBright: '#ecd6f0',
                midHigh: '#f9ecfa',
                outerMain: '#fceef8',
                outerHigh: '#ffffff',
              }
            : {
                coreDeep: '#9c7844',
                coreShadow: 'rgba(116, 74, 24, 0.76)',
                midDark: '#c6a268',
                midShadow: 'rgba(140, 96, 36, 0.54)',
                midBright: '#ebd4a0',
                midHigh: '#fcedc4',
                outerMain: '#fff2cc',
                outerHigh: '#fffdf2',
              };

      // Layer 0: Soft inner shadow volume (20 overlapping rounded cushion leaves at cluster core)
      for (let i = 0; i < 20; i += 1) {
        const angle = (i / 20) * Math.PI * 2 + (rng() - 0.5) * 0.35;
        const dist = 14 + rng() * 68;
        const lx = half + Math.cos(angle) * dist;
        const ly = half + Math.sin(angle) * dist;
        if (variant === 'sakuraSpray') {
          drawPillowySakuraPuff(
            ctx,
            lx,
            ly,
            30 + rng() * 14,
            rng() * Math.PI * 2,
            palette.coreDeep,
            palette.coreShadow,
            palette.midDark,
          );
        } else {
          drawRoundedBotanicalLeaf(
            ctx,
            lx,
            ly,
            26 + rng() * 12,
            32 + rng() * 14,
            rng() * Math.PI * 2,
            palette.coreDeep,
            palette.coreShadow,
          );
        }
      }

      // Layer 1: Deep mid-volume rounded botanical leaves (30 overlapping leaves)
      for (let i = 0; i < 30; i += 1) {
        const angle = (i / 30) * Math.PI * 2 + 0.12 + (rng() - 0.5) * 0.32;
        const dist = 42 + rng() * 78;
        const lx = half + Math.cos(angle) * dist;
        const ly = half + Math.sin(angle) * dist;
        if (variant === 'sakuraSpray') {
          drawPillowySakuraPuff(
            ctx,
            lx,
            ly,
            27 + rng() * 12,
            rng() * Math.PI * 2,
            palette.midDark,
            palette.midShadow,
            palette.midBright,
          );
        } else {
          drawRoundedBotanicalLeaf(
            ctx,
            lx,
            ly,
            23 + rng() * 10,
            29 + rng() * 12,
            angle + (rng() - 0.5) * 1.1,
            palette.midDark,
            palette.midShadow,
            palette.midBright,
          );
        }
      }

      // Layer 2: Lush mid-lit scalloped leaf canopy layer (36 tiny plump overlapping leaves)
      for (let i = 0; i < 36; i += 1) {
        const angle = (i / 36) * Math.PI * 2 + 0.25 + (rng() - 0.5) * 0.28;
        const dist = 68 + rng() * 88;
        const lx = half + Math.cos(angle) * dist;
        const ly = half + Math.sin(angle) * dist;
        if (variant === 'sakuraSpray') {
          drawPillowySakuraPuff(
            ctx,
            lx,
            ly,
            23 + rng() * 11,
            rng() * Math.PI * 2,
            palette.midBright,
            palette.midShadow,
            palette.outerHigh,
          );
        } else {
          drawRoundedBotanicalLeaf(
            ctx,
            lx,
            ly,
            20 + rng() * 9,
            25 + rng() * 11,
            angle + (rng() - 0.5) * 1.2,
            palette.midBright,
            palette.midShadow,
            palette.midHigh,
          );
        }
      }

      // Layer 3: Delicate outer scalloped rounded leaf puffs & sunlit crown flecks (30 tiny leaves)
      for (let i = 0; i < 30; i += 1) {
        const angle = (i / 30) * Math.PI * 2 + 0.4 + (rng() - 0.5) * 0.26;
        const dist = 114 + rng() * 68;
        const lx = half + Math.cos(angle) * dist;
        const ly = half + Math.sin(angle) * dist;
        if (variant === 'sakuraSpray') {
          drawPillowySakuraPuff(
            ctx,
            lx,
            ly,
            19 + rng() * 9,
            rng() * Math.PI * 2,
            palette.outerMain,
            palette.midShadow,
            palette.outerHigh,
          );
        } else {
          drawRoundedBotanicalLeaf(
            ctx,
            lx,
            ly,
            16 + rng() * 8,
            20 + rng() * 9,
            angle + (rng() - 0.5) * 1.3,
            palette.outerMain,
            palette.midShadow,
            palette.outerHigh,
          );
        }
      }

      // Soft inner shadow AO vignette baked purely onto opaque pixels for deep pillowy volume
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const innerDepthGrad = ctx.createRadialGradient(
        half - 18,
        half - 24,
        18,
        half,
        half + 14,
        half * 0.92,
      );
      innerDepthGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.14)');
      innerDepthGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.0)');
      innerDepthGrad.addColorStop(1.0, 'rgba(40, 52, 68, 0.18)');
      ctx.fillStyle = innerDepthGrad;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();

      // Smooth antialiased alpha threshold centered cleanly around alphaTest: 0.4 (102/255)
      const imgData = ctx.getImageData(0, 0, size, size);
      const px = imgData.data;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3];
        if (a <= 58) {
          px[i + 3] = 0;
        } else if (a >= 148) {
          px[i + 3] = 255;
        } else {
          px[i + 3] = Math.round(((a - 58) / 90) * 255);
        }
      }
      ctx.putImageData(imgData, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      return tex;
    }
  }

  // Deterministic Node.js RGBA fallback for headless unit tests
  const fallbackRes = 64;
  const data = new Uint8Array(fallbackRes * fallbackRes * 4);
  for (let y = 0; y < fallbackRes; y += 1) {
    for (let x = 0; x < fallbackRes; x += 1) {
      const nx = (x / (fallbackRes - 1)) * 2 - 1;
      const ny = (y / (fallbackRes - 1)) * 2 - 1;
      const angle = Math.atan2(ny, nx);
      const lobeRadius = 0.7 + 0.2 * Math.sin(angle * 9.0);
      const inside = Math.hypot(nx, ny) <= lobeRadius;
      const idx = (y * fallbackRes + x) * 4;
      data[idx] = 244;
      data[idx + 1] = 248;
      data[idx + 2] = 244;
      data[idx + 3] = inside ? 255 : 0;
    }
  }
  const fallback = new THREE.DataTexture(
    data,
    fallbackRes,
    fallbackRes,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  fallback.colorSpace = THREE.SRGBColorSpace;
  fallback.needsUpdate = true;
  return fallback;
}

// ---------------------------------------------------------------------------
// 2. Painterly Mossy-Base Gnarled Trunks & Spreading Branches (No Black Outlines)
// ---------------------------------------------------------------------------

interface BranchTubeSpec {
  points: THREE.Vector3[];
  rStart: number;
  rEnd: number;
  tubularSegs: number;
  radialSegs: number;
  rootFlare?: boolean;
  rootLobes?: number;
  gnarlStrength?: number;
}

function buildTaperedOrganicTube(spec: BranchTubeSpec): THREE.BufferGeometry {
  const {
    points,
    rStart,
    rEnd,
    tubularSegs,
    radialSegs,
    rootFlare = false,
    rootLobes = 4,
    gnarlStrength = 0.08,
  } = spec;

  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const ringStride = radialSegs + 1;
  const p = new THREE.Vector3();
  const offset = new THREE.Vector3();

  // Natural mossy root-base tint blending into warm painterly wood bark
  const mossyRootTint = new THREE.Color('#6a8a56');
  const midBarkTint = new THREE.Color('#d8c4b4');
  const limbBarkTint = new THREE.Color('#f7ece2');
  const vColor = new THREE.Color();

  for (let i = 0; i <= tubularSegs; i += 1) {
    const t = i / tubularSegs;
    curve.getPointAt(t, p);

    let baseRadius = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
    if (rootFlare && t < 0.34) {
      const flareK = Math.pow(1 - t / 0.34, 1.7);
      baseRadius *= 1 + flareK * 0.62;
    }

    const N = frames.normals[i];
    const B = frames.binormals[i];

    if (rootFlare && t < 0.32) {
      vColor.copy(mossyRootTint).lerp(midBarkTint, t / 0.32);
    } else if (t < 0.45) {
      vColor.copy(midBarkTint).lerp(limbBarkTint, t / 0.45);
    } else {
      vColor.copy(limbBarkTint);
    }

    for (let j = 0; j <= radialSegs; j += 1) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let radialMod =
        1.0 + gnarlStrength * Math.sin(theta * 3.0 + t * 6.0) * (1 - t * 0.4);
      if (rootFlare && t < 0.36) {
        const fluteK = Math.pow(1 - t / 0.36, 1.5);
        radialMod += Math.max(0, Math.cos(theta * rootLobes + 0.35)) * 0.32 * fluteK;
      }

      const r = baseRadius * radialMod;
      offset
        .set(0, 0, 0)
        .addScaledVector(N, cosT * r)
        .addScaledVector(B, sinT * r);
      positions.push(p.x + offset.x, p.y + offset.y, p.z + offset.z);
      colors.push(vColor.r, vColor.g, vColor.b);
    }
  }

  // Right-handed outward winding: normals face cleanly outward
  for (let i = 0; i < tubularSegs; i += 1) {
    for (let j = 0; j < radialSegs; j += 1) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates one of 3 painterly curved gnarled trunks with flared mossy buttress roots
 * and wide spreading limbs supporting full anime tree crowns (no heavy black outlines).
 */
export function createTreeTrunkGeometry(
  archetype: TreeArchetypeKind,
): THREE.BufferGeometry {
  let specs: BranchTubeSpec[];

  if (archetype === 'deepTeal') {
    // Sturdy wide-spreading hero oak/banyan trunk matching the left emerald-teal reference tree
    specs = [
      {
        points: [
          new THREE.Vector3(0, -0.65, 0),
          new THREE.Vector3(0.08, 0.55, 0.05),
          new THREE.Vector3(0.16, 1.72, 0.08),
          new THREE.Vector3(-0.08, 2.95, -0.05),
          new THREE.Vector3(0.05, 4.35, 0.04),
        ],
        rStart: 0.48,
        rEnd: 0.16,
        tubularSegs: 11,
        radialSegs: 8,
        rootFlare: true,
        rootLobes: 5,
        gnarlStrength: 0.1,
      },
      {
        points: [
          new THREE.Vector3(0.08, 2.2, 0.04),
          new THREE.Vector3(1.15, 3.05, 0.48),
          new THREE.Vector3(2.38, 3.85, 0.86),
        ],
        rStart: 0.22,
        rEnd: 0.085,
        tubularSegs: 6,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(-0.05, 2.42, -0.04),
          new THREE.Vector3(-1.12, 3.25, -0.42),
          new THREE.Vector3(-2.15, 4.05, -0.68),
        ],
        rStart: 0.21,
        rEnd: 0.08,
        tubularSegs: 6,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(-0.02, 2.6, 0.04),
          new THREE.Vector3(-0.42, 3.38, 0.96),
          new THREE.Vector3(-0.78, 4.05, 1.82),
        ],
        rStart: 0.17,
        rEnd: 0.07,
        tubularSegs: 5,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(0.02, 2.68, -0.05),
          new THREE.Vector3(0.46, 3.36, -0.92),
          new THREE.Vector3(0.84, 4.02, -1.72),
        ],
        rStart: 0.16,
        rEnd: 0.065,
        tubularSegs: 5,
        radialSegs: 6,
      },
    ];
  } else if (archetype === 'pastelSakura') {
    // Tall graceful sakura trunk reaching into stacked fluffy pastel blossom tiers
    specs = [
      {
        points: [
          new THREE.Vector3(0, -0.65, 0),
          new THREE.Vector3(-0.06, 0.72, 0.05),
          new THREE.Vector3(-0.18, 2.1, 0.1),
          new THREE.Vector3(0.14, 3.55, -0.05),
          new THREE.Vector3(0.28, 5.25, -0.1),
        ],
        rStart: 0.44,
        rEnd: 0.14,
        tubularSegs: 12,
        radialSegs: 8,
        rootFlare: true,
        rootLobes: 5,
        gnarlStrength: 0.09,
      },
      {
        points: [
          new THREE.Vector3(-0.08, 2.45, 0.06),
          new THREE.Vector3(0.95, 3.25, 0.52),
          new THREE.Vector3(1.88, 4.05, 0.82),
        ],
        rStart: 0.19,
        rEnd: 0.075,
        tubularSegs: 6,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(-0.1, 2.7, 0.02),
          new THREE.Vector3(-1.05, 3.45, -0.35),
          new THREE.Vector3(-1.95, 4.18, -0.68),
        ],
        rStart: 0.18,
        rEnd: 0.07,
        tubularSegs: 6,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(0.1, 3.45, -0.04),
          new THREE.Vector3(0.25, 4.25, -0.92),
          new THREE.Vector3(0.18, 5.0, -1.62),
        ],
        rStart: 0.15,
        rEnd: 0.065,
        tubularSegs: 5,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(-0.04, 3.32, 0.05),
          new THREE.Vector3(-0.36, 4.05, 0.82),
          new THREE.Vector3(-0.56, 4.72, 1.48),
        ],
        rStart: 0.14,
        rEnd: 0.06,
        tubularSegs: 5,
        radialSegs: 6,
      },
    ];
  } else {
    // Full compact golden-amber tree trunk with low spreading sunlit branches
    specs = [
      {
        points: [
          new THREE.Vector3(0, -0.62, 0),
          new THREE.Vector3(0.05, 0.48, -0.04),
          new THREE.Vector3(-0.08, 1.48, 0.06),
          new THREE.Vector3(0.08, 2.55, 0.03),
          new THREE.Vector3(-0.02, 3.65, -0.04),
        ],
        rStart: 0.4,
        rEnd: 0.13,
        tubularSegs: 10,
        radialSegs: 8,
        rootFlare: true,
        rootLobes: 4,
        gnarlStrength: 0.1,
      },
      {
        points: [
          new THREE.Vector3(0.03, 1.75, 0.04),
          new THREE.Vector3(0.88, 2.48, 0.42),
          new THREE.Vector3(1.68, 3.12, 0.68),
        ],
        rStart: 0.17,
        rEnd: 0.07,
        tubularSegs: 5,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(-0.05, 1.9, -0.02),
          new THREE.Vector3(-0.92, 2.62, -0.36),
          new THREE.Vector3(-1.72, 3.22, -0.62),
        ],
        rStart: 0.17,
        rEnd: 0.07,
        tubularSegs: 5,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(0.0, 2.1, 0.02),
          new THREE.Vector3(-0.28, 2.76, 0.8),
          new THREE.Vector3(-0.48, 3.3, 1.42),
        ],
        rStart: 0.14,
        rEnd: 0.06,
        tubularSegs: 5,
        radialSegs: 6,
      },
      {
        points: [
          new THREE.Vector3(0.02, 2.15, -0.03),
          new THREE.Vector3(0.32, 2.82, -0.78),
          new THREE.Vector3(0.54, 3.32, -1.38),
        ],
        rStart: 0.14,
        rEnd: 0.06,
        tubularSegs: 5,
        radialSegs: 6,
      },
    ];
  }

  const parts = specs.map((spec) => buildTaperedOrganicTube(spec));
  const merged = mergeParts(parts, true, false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// 3. 250+ Fine Feathery Leaf-Cluster Card Canopies (Wide, Full, Luminous Crowns)
// ---------------------------------------------------------------------------

interface SubCrownSpec {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  cardCount: number;
  cardSize: number;
}

interface CardCanopyLayout {
  seed: number;
  innerColor: string;
  midColor: string;
  sunColor: string;
  subCrowns: readonly SubCrownSpec[];
}

/**
 * 6–7 lush pillowy rounded dome sub-crowns per archetype totaling 408–432 overlapping
 * soft botanical leaf-cluster cards for full, cloud-like Ghibli/Genshin crowns.
 */
export const CANOPY_SUBCROWNS: Record<TreeArchetypeKind, CardCanopyLayout> = {
  // Left reference hero: wide pillowy deep teal-emerald dome crown (424 overlapping rounded cards)
  deepTeal: {
    seed: WORLD_SEED + 3101,
    innerColor: TREE_COLORS.deepTealCore,
    midColor: TREE_COLORS.deepTealMid,
    sunColor: TREE_COLORS.deepTealTip,
    subCrowns: [
      // 1. Broad central rounded summit dome
      { x: 0.05, y: 5.55, z: 0.04, rx: 2.28, ry: 1.72, rz: 2.18, cardCount: 84, cardSize: 1.24 },
      // 2. Wide east billowing dome shoulder
      { x: 2.38, y: 4.48, z: 0.78, rx: 1.96, ry: 1.5, rz: 1.84, cardCount: 68, cardSize: 1.2 },
      // 3. Full west rounded dome bough
      { x: -2.14, y: 4.72, z: -0.62, rx: 1.92, ry: 1.52, rz: 1.82, cardCount: 66, cardSize: 1.2 },
      // 4. Front plush crown dome
      { x: -0.78, y: 4.55, z: 1.82, rx: 1.78, ry: 1.38, rz: 1.72, cardCount: 58, cardSize: 1.15 },
      // 5. Back plush crown dome
      { x: 0.84, y: 4.6, z: -1.72, rx: 1.78, ry: 1.38, rz: 1.7, cardCount: 56, cardSize: 1.15 },
      // 6. Lower sweeping left rounded bough
      { x: -2.42, y: 3.85, z: 0.76, rx: 1.48, ry: 1.16, rz: 1.42, cardCount: 48, cardSize: 1.1 },
      // 7. Far right sunlit dome puff
      { x: 3.05, y: 4.12, z: -0.52, rx: 1.42, ry: 1.14, rz: 1.38, cardCount: 44, cardSize: 1.08 },
    ],
  },

  // Middle-right reference hero: tall billowing pastel sakura pink cloud domes (432 cards)
  pastelSakura: {
    seed: WORLD_SEED + 3207,
    innerColor: TREE_COLORS.sakuraShadow,
    midColor: TREE_COLORS.sakuraPink,
    sunColor: TREE_COLORS.sakuraHighlight,
    subCrowns: [
      // 1. Lofty rounded crown apex dome
      { x: 0.22, y: 7.22, z: -0.06, rx: 1.92, ry: 1.56, rz: 1.86, cardCount: 74, cardSize: 1.22 },
      // 2. Upper-mid expansive cotton-candy dome body
      { x: 0.15, y: 5.86, z: 0.08, rx: 2.38, ry: 1.64, rz: 2.28, cardCount: 84, cardSize: 1.25 },
      // 3. Lower-west pillowy sakura dome
      { x: -1.96, y: 4.52, z: -0.58, rx: 1.78, ry: 1.36, rz: 1.68, cardCount: 60, cardSize: 1.16 },
      // 4. Lower-east pillowy sakura dome
      { x: 1.92, y: 4.62, z: 0.74, rx: 1.78, ry: 1.38, rz: 1.7, cardCount: 60, cardSize: 1.16 },
      // 5. Front plush blossom cloud dome
      { x: -0.58, y: 5.02, z: 1.62, rx: 1.72, ry: 1.32, rz: 1.64, cardCount: 56, cardSize: 1.14 },
      // 6. Back plush blossom cloud dome
      { x: 0.3, y: 5.2, z: -1.64, rx: 1.72, ry: 1.32, rz: 1.64, cardCount: 54, cardSize: 1.14 },
      // 7. Low hanging rounded blossom puff
      { x: -1.4, y: 3.88, z: 1.14, rx: 1.44, ry: 1.1, rz: 1.38, cardCount: 44, cardSize: 1.08 },
    ],
  },

  // Right reference hero: full rounded warm golden-amber dome crown (408 cards)
  goldenAmber: {
    seed: WORLD_SEED + 3311,
    innerColor: TREE_COLORS.amberShadow,
    midColor: TREE_COLORS.goldenAmber,
    sunColor: TREE_COLORS.goldenSun,
    subCrowns: [
      // 1. Full sunlit golden summit dome
      { x: 0.0, y: 4.52, z: 0.0, rx: 1.94, ry: 1.48, rz: 1.9, cardCount: 84, cardSize: 1.16 },
      // 2. East golden dome bough
      { x: 1.68, y: 3.65, z: 0.62, rx: 1.62, ry: 1.24, rz: 1.56, cardCount: 70, cardSize: 1.12 },
      // 3. West golden dome bough
      { x: -1.66, y: 3.74, z: -0.54, rx: 1.62, ry: 1.26, rz: 1.56, cardCount: 70, cardSize: 1.12 },
      // 4. Front sunlit golden dome puff
      { x: -0.48, y: 3.62, z: 1.44, rx: 1.52, ry: 1.18, rz: 1.48, cardCount: 64, cardSize: 1.1 },
      // 5. Back golden dome puff
      { x: 0.52, y: 3.68, z: -1.38, rx: 1.52, ry: 1.18, rz: 1.46, cardCount: 62, cardSize: 1.1 },
      // 6. Lower golden rounded rim dome
      { x: 1.18, y: 3.16, z: -1.04, rx: 1.42, ry: 1.06, rz: 1.38, cardCount: 58, cardSize: 1.06 },
    ],
  },
};

export function getCanopyCardCount(archetype: TreeArchetypeKind): number {
  return CANOPY_SUBCROWNS[archetype].subCrowns.reduce((sum, sc) => sum + sc.cardCount, 0);
}

/**
 * Generates a wide, full, feathery anime canopy built from 256–276 fine alpha-cutout
 * leaf-cluster cards arranged across 6–7 organic sub-crowns. Vertex normals are bent
 * smoothly outward and upward from the canopy core so foliage shades softly and luminously
 * with rich inner teal/lavender/amber depth and bright sunlit crowns.
 */
export function createFluffyCanopyGeometry(
  archetype: TreeArchetypeKind,
): THREE.BufferGeometry {
  const layout = CANOPY_SUBCROWNS[archetype];
  const rng = mulberry32(layout.seed);

  const totalCards = getCanopyCardCount(archetype);
  const positions = new Float32Array(totalCards * 6 * 3);
  const normals = new Float32Array(totalCards * 6 * 3);
  const uvs = new Float32Array(totalCards * 6 * 2);
  const colors = new Float32Array(totalCards * 6 * 3);

  // Compute overall canopy center & vertical bounds for cohesive sunlight-to-shadow gradient
  let canopyMinY = Infinity;
  let canopyMaxY = -Infinity;
  const canopyCore = new THREE.Vector3();
  for (const sc of layout.subCrowns) {
    canopyCore.x += sc.x;
    canopyCore.y += sc.y;
    canopyCore.z += sc.z;
    canopyMinY = Math.min(canopyMinY, sc.y - sc.ry);
    canopyMaxY = Math.max(canopyMaxY, sc.y + sc.ry);
  }
  canopyCore.divideScalar(layout.subCrowns.length);
  const overallNormalOrigin = new THREE.Vector3(
    canopyCore.x,
    canopyMinY - 0.55,
    canopyCore.z,
  );

  const subNormalOrigin = new THREE.Vector3();
  const cardCenter = new THREE.Vector3();
  const outDir = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  const altUp = new THREE.Vector3(1, 0, 0);
  const rightAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const rotRight = new THREE.Vector3();
  const rotUp = new THREE.Vector3();
  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();
  const vNormGlobal = new THREE.Vector3();

  const innerShadeColor = new THREE.Color(layout.innerColor);
  const midLeafColor = new THREE.Color(layout.midColor);
  const sunlitTipColor = new THREE.Color(layout.sunColor);
  const vColor = new THREE.Color();

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const quadCorners: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, -0.5, 0, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];

  let vertCursor = 0;

  for (let scIdx = 0; scIdx < layout.subCrowns.length; scIdx += 1) {
    const sc = layout.subCrowns[scIdx];
    subNormalOrigin.set(sc.x, sc.y - sc.ry * 0.95, sc.z);

    for (let c = 0; c < sc.cardCount; c += 1) {
      // 36% deep inner cushion cards + 64% overlapping rounded outer dome shell cards
      const isInnerCore = c < Math.floor(sc.cardCount * 0.36);
      const t = (c + 0.5) / sc.cardCount;

      const yUnit = isInnerCore ? -0.32 + rng() * 1.18 : 1.0 - t * 1.48;
      const clampedY = THREE.MathUtils.clamp(yUnit, -0.52, 0.99);
      const ringR = Math.sqrt(Math.max(0.015, 1.0 - clampedY * clampedY));
      const theta = c * GOLDEN_ANGLE + scIdx * 1.83 + (rng() - 0.5) * 0.32;

      const shellScale = isInnerCore ? 0.14 + rng() * 0.42 : 0.62 + rng() * 0.27;

      outDir
        .set(Math.cos(theta) * ringR, clampedY, Math.sin(theta) * ringR)
        .normalize();

      cardCenter.set(
        sc.x + outDir.x * sc.rx * shellScale,
        sc.y + outDir.y * sc.ry * shellScale,
        sc.z + outDir.z * sc.rz * shellScale,
      );

      // Smooth tangent card frame hugging the rounded dome crown cleanly (zero thin edge-on slivers)
      const refUp = Math.abs(outDir.y) > 0.9 ? altUp : upVec;
      rightAxis.crossVectors(refUp, outDir).normalize();
      upAxis.crossVectors(outDir, rightAxis).normalize();

      const tiltPitch = isInnerCore
        ? (rng() - 0.5) * 0.36 + (c % 2 === 0 ? 0.22 : -0.22)
        : (rng() - 0.5) * 0.14 + 0.04;
      const tiltYaw = isInnerCore ? (rng() - 0.5) * 0.36 : (rng() - 0.5) * 0.14;
      const cosP = Math.cos(tiltPitch);
      const sinP = Math.sin(tiltPitch);
      const cosY = Math.cos(tiltYaw);
      const sinY = Math.sin(tiltYaw);

      const tiltedRight = rightAxis
        .clone()
        .multiplyScalar(cosY)
        .addScaledVector(outDir, sinY)
        .normalize();
      const tiltedUp = upAxis
        .clone()
        .multiplyScalar(cosP)
        .addScaledVector(outDir, sinP)
        .normalize();

      const spin = rng() * Math.PI * 2;
      const cosS = Math.cos(spin);
      const sinS = Math.sin(spin);
      rotRight
        .copy(tiltedRight)
        .multiplyScalar(cosS)
        .addScaledVector(tiltedUp, sinS);
      rotUp
        .copy(tiltedUp)
        .multiplyScalar(cosS)
        .addScaledVector(tiltedRight, -sinS);

      const sizeJitter = isInnerCore ? 0.94 + rng() * 0.24 : 0.8 + rng() * 0.3;
      const w = sc.cardSize * sizeJitter * (0.94 + rng() * 0.12);
      const h = sc.cardSize * sizeJitter * (0.92 + rng() * 0.12);
      const cardLuminanceJitter = 0.92 + rng() * 0.14;

      for (let k = 0; k < 6; k += 1) {
        const [ox, oy, u, v] = quadCorners[k];
        vPos
          .copy(cardCenter)
          .addScaledVector(rotRight, ox * w)
          .addScaledVector(rotUp, oy * h);

        // Blend global canopy normal + local sub-crown normal with natural dome curvature
        vNorm.copy(vPos).sub(subNormalOrigin);
        const distFromSub = vNorm.length();
        if (distFromSub < 1e-5) {
          vNorm.set(0, 1, 0);
        } else {
          vNorm.divideScalar(distFromSub);
        }

        vNormGlobal.copy(vPos).sub(overallNormalOrigin).normalize();
        vNorm.lerp(vNormGlobal, 0.52);
        vNorm.y = Math.max(vNorm.y, -0.35) + 0.42;
        vNorm.normalize();

        // Deep saturated lower-canopy shade rising dramatically into vibrant sunlit crown tips
        const globalHeightRatio = THREE.MathUtils.clamp(
          (vPos.y - canopyMinY) / Math.max(canopyMaxY - canopyMinY, 0.01),
          0,
          1,
        );
        const subHeightRatio = THREE.MathUtils.clamp(
          (vPos.y - (sc.y - sc.ry)) / Math.max(sc.ry * 2.1, 0.01),
          0,
          1,
        );
        const radialRatio = THREE.MathUtils.clamp(
          distFromSub / Math.max(sc.rx * 1.15, 0.01),
          0,
          1,
        );

        const lightMask = THREE.MathUtils.clamp(
          Math.pow(globalHeightRatio, 1.25) * 0.52 +
            subHeightRatio * 0.26 +
            radialRatio * 0.22 +
            (isInnerCore ? -0.26 : 0.02),
          0,
          1,
        );

        if (lightMask < 0.52) {
          vColor.copy(innerShadeColor).lerp(midLeafColor, lightMask / 0.52);
        } else {
          vColor.copy(midLeafColor).lerp(sunlitTipColor, (lightMask - 0.52) / 0.48);
        }
        vColor.multiplyScalar(cardLuminanceJitter);

        const pIdx = vertCursor * 3;
        positions[pIdx] = vPos.x;
        positions[pIdx + 1] = vPos.y;
        positions[pIdx + 2] = vPos.z;

        normals[pIdx] = vNorm.x;
        normals[pIdx + 1] = vNorm.y;
        normals[pIdx + 2] = vNorm.z;

        colors[pIdx] = Math.min(1.0, vColor.r);
        colors[pIdx + 1] = Math.min(1.0, vColor.g);
        colors[pIdx + 2] = Math.min(1.0, vColor.b);

        const uvIdx = vertCursor * 2;
        uvs[uvIdx] = u;
        uvs[uvIdx + 1] = v;

        vertCursor += 1;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Generates a feathery alpha-cutout low mossy shrub (44 leaf-cluster cards with
 * upward-bent normals and rich moss-to-sunlit-lime shading) to hug tree roots naturally.
 */
export function createMossyShrubGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(WORLD_SEED + 4409);
  const cardCount = 44;
  const positions = new Float32Array(cardCount * 6 * 3);
  const normals = new Float32Array(cardCount * 6 * 3);
  const uvs = new Float32Array(cardCount * 6 * 2);
  const colors = new Float32Array(cardCount * 6 * 3);

  const rx = 1.05;
  const ry = 0.68;
  const rz = 0.96;
  const normalOrigin = new THREE.Vector3(0, -0.32, 0);
  const cardCenter = new THREE.Vector3();
  const outDir = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  const altUp = new THREE.Vector3(1, 0, 0);
  const rightAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const rotRight = new THREE.Vector3();
  const rotUp = new THREE.Vector3();
  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();

  const darkMoss = new THREE.Color(TREE_COLORS.mossShrubDark);
  const midMoss = new THREE.Color('#38b54c');
  const sunMoss = new THREE.Color(TREE_COLORS.mossShrubSun);
  const vColor = new THREE.Color();
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const quadCorners: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, -0.5, 0, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];

  let vertCursor = 0;
  for (let c = 0; c < cardCount; c += 1) {
    const isInner = c < 14;
    const t = (c + 0.5) / cardCount;
    const yUnit = isInner ? 0.08 + rng() * 0.72 : 0.98 - t * 0.96;
    const clampedY = THREE.MathUtils.clamp(yUnit, 0.02, 0.98);
    const ringR = Math.sqrt(Math.max(0.02, 1.0 - clampedY * clampedY));
    const theta = c * GOLDEN_ANGLE + (rng() - 0.5) * 0.4;
    const shell = isInner ? 0.2 + rng() * 0.35 : 0.62 + rng() * 0.36;

    outDir.set(Math.cos(theta) * ringR, clampedY, Math.sin(theta) * ringR).normalize();
    cardCenter.set(outDir.x * rx * shell, 0.22 + outDir.y * ry * shell, outDir.z * rz * shell);

    const refUp = Math.abs(outDir.y) > 0.9 ? altUp : upVec;
    rightAxis.crossVectors(refUp, outDir).normalize();
    upAxis.crossVectors(outDir, rightAxis).normalize();

    const spin = rng() * Math.PI * 2;
    const cosS = Math.cos(spin);
    const sinS = Math.sin(spin);
    rotRight.copy(rightAxis).multiplyScalar(cosS).addScaledVector(upAxis, sinS);
    rotUp.copy(upAxis).multiplyScalar(cosS).addScaledVector(rightAxis, -sinS);

    const size = (isInner ? 0.78 : 0.74) + rng() * 0.28;
    const jitter = 0.92 + rng() * 0.16;

    for (let k = 0; k < 6; k += 1) {
      const [ox, oy, u, v] = quadCorners[k];
      vPos.copy(cardCenter).addScaledVector(rotRight, ox * size).addScaledVector(rotUp, oy * size);
      vPos.y = Math.max(0.02, vPos.y);

      vNorm.copy(vPos).sub(normalOrigin).normalize();
      vNorm.y = Math.max(vNorm.y, 0.05) + 0.55;
      vNorm.normalize();

      const hRatio = THREE.MathUtils.clamp(vPos.y / (ry * 1.35), 0, 1);
      const mask = THREE.MathUtils.clamp(hRatio * 0.8 + (isInner ? -0.18 : 0.12), 0, 1);
      if (mask < 0.48) {
        vColor.copy(darkMoss).lerp(midMoss, mask / 0.48);
      } else {
        vColor.copy(midMoss).lerp(sunMoss, (mask - 0.48) / 0.52);
      }
      vColor.multiplyScalar(jitter);

      const pIdx = vertCursor * 3;
      positions[pIdx] = vPos.x;
      positions[pIdx + 1] = vPos.y;
      positions[pIdx + 2] = vPos.z;
      normals[pIdx] = vNorm.x;
      normals[pIdx + 1] = vNorm.y;
      normals[pIdx + 2] = vNorm.z;
      colors[pIdx] = Math.min(1, vColor.r);
      colors[pIdx + 1] = Math.min(1, vColor.g);
      colors[pIdx + 2] = Math.min(1, vColor.b);
      uvs[vertCursor * 2] = u;
      uvs[vertCursor * 2 + 1] = v;
      vertCursor += 1;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Lightweight lush rounded dome canopy (156 overlapping botanical cards) for distant
 * ridge-line tree clusters so the horizon treeline reads deep, fluffy, and atmospheric.
 */
export function createRidgeCanopyGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(WORLD_SEED + 6101);
  const domes: ReadonlyArray<SubCrownSpec> = [
    { x: 0.0, y: 4.9, z: 0.0, rx: 2.35, ry: 1.72, rz: 2.25, cardCount: 58, cardSize: 1.48 },
    { x: 1.95, y: 4.0, z: 0.65, rx: 1.75, ry: 1.38, rz: 1.68, cardCount: 34, cardSize: 1.38 },
    { x: -1.85, y: 4.15, z: -0.58, rx: 1.72, ry: 1.38, rz: 1.65, cardCount: 34, cardSize: 1.38 },
    { x: -0.35, y: 4.1, z: 1.58, rx: 1.55, ry: 1.24, rz: 1.5, cardCount: 30, cardSize: 1.32 },
  ];

  const totalCards = domes.reduce((sum, d) => sum + d.cardCount, 0);
  const positions = new Float32Array(totalCards * 6 * 3);
  const normals = new Float32Array(totalCards * 6 * 3);
  const uvs = new Float32Array(totalCards * 6 * 2);
  const colors = new Float32Array(totalCards * 6 * 3);

  const normalOrigin = new THREE.Vector3(0, 1.8, 0);
  const cardCenter = new THREE.Vector3();
  const outDir = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  const altUp = new THREE.Vector3(1, 0, 0);
  const rightAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const rotRight = new THREE.Vector3();
  const rotUp = new THREE.Vector3();
  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();

  const innerCol = new THREE.Color('#0c4c42');
  const midCol = new THREE.Color('#1d9652');
  const sunCol = new THREE.Color('#66de64');
  const vColor = new THREE.Color();
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const quadCorners: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, -0.5, 0, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];

  let vertCursor = 0;
  for (let dIdx = 0; dIdx < domes.length; dIdx += 1) {
    const sc = domes[dIdx];
    for (let c = 0; c < sc.cardCount; c += 1) {
      const isInner = c < Math.floor(sc.cardCount * 0.3);
      const t = (c + 0.5) / sc.cardCount;
      const yUnit = isInner ? -0.25 + rng() * 1.1 : 1.0 - t * 1.42;
      const clampedY = THREE.MathUtils.clamp(yUnit, -0.45, 0.99);
      const ringR = Math.sqrt(Math.max(0.02, 1.0 - clampedY * clampedY));
      const theta = c * GOLDEN_ANGLE + dIdx * 2.1 + (rng() - 0.5) * 0.35;
      const shell = isInner ? 0.2 + rng() * 0.38 : 0.72 + rng() * 0.3;

      outDir.set(Math.cos(theta) * ringR, clampedY, Math.sin(theta) * ringR).normalize();
      cardCenter.set(
        sc.x + outDir.x * sc.rx * shell,
        sc.y + outDir.y * sc.ry * shell,
        sc.z + outDir.z * sc.rz * shell,
      );

      const refUp = Math.abs(outDir.y) > 0.9 ? altUp : upVec;
      rightAxis.crossVectors(refUp, outDir).normalize();
      upAxis.crossVectors(outDir, rightAxis).normalize();

      const spin = rng() * Math.PI * 2;
      const cosS = Math.cos(spin);
      const sinS = Math.sin(spin);
      rotRight.copy(rightAxis).multiplyScalar(cosS).addScaledVector(upAxis, sinS);
      rotUp.copy(upAxis).multiplyScalar(cosS).addScaledVector(rightAxis, -sinS);

      const size = sc.cardSize * (0.84 + rng() * 0.32);
      const jitter = 0.92 + rng() * 0.16;

      for (let k = 0; k < 6; k += 1) {
        const [ox, oy, u, v] = quadCorners[k];
        vPos
          .copy(cardCenter)
          .addScaledVector(rotRight, ox * size)
          .addScaledVector(rotUp, oy * size);

        vNorm.copy(vPos).sub(normalOrigin).normalize();
        vNorm.y = Math.max(vNorm.y, -0.15) + 0.62;
        vNorm.normalize();

        const mask = THREE.MathUtils.clamp((vPos.y - 2.4) / 4.4 + (isInner ? -0.2 : 0.08), 0, 1);
        if (mask < 0.48) {
          vColor.copy(innerCol).lerp(midCol, mask / 0.48);
        } else {
          vColor.copy(midCol).lerp(sunCol, (mask - 0.48) / 0.52);
        }
        vColor.multiplyScalar(jitter);

        const pIdx = vertCursor * 3;
        positions[pIdx] = vPos.x;
        positions[pIdx + 1] = vPos.y;
        positions[pIdx + 2] = vPos.z;
        normals[pIdx] = vNorm.x;
        normals[pIdx + 1] = vNorm.y;
        normals[pIdx + 2] = vNorm.z;
        colors[pIdx] = Math.min(1, vColor.r);
        colors[pIdx + 1] = Math.min(1, vColor.g);
        colors[pIdx + 2] = Math.min(1, vColor.b);
        uvs[vertCursor * 2] = u;
        uvs[vertCursor * 2 + 1] = v;
        vertCursor += 1;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// 4. Leaf-Card Shader Patching (Wind Sway + Seamless Normals + Warm Top Rim-Glow)
// ---------------------------------------------------------------------------

interface TreeWindUniforms {
  uWindTime: { value: number };
  uWindStrength: { value: number };
  uWindDirection: { value: THREE.Vector2 };
}

interface SunRimOptions {
  sunDirection: THREE.Vector3;
  rimColor: string;
  rimIntensity: number;
}

const WIND_VERTEX_PARS = /* glsl */ `
#include <common>
uniform float uWindTime;
uniform float uWindStrength;
uniform vec2 uWindDirection;
varying vec3 vLeafWorldNormal;
`;

const DEPTH_WIND_VERTEX_PARS = /* glsl */ `
#include <common>
uniform float uWindTime;
uniform float uWindStrength;
uniform vec2 uWindDirection;
`;

const WIND_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  vec2 treeWorldXZ = vec2( 0.0 );
  #ifdef USE_INSTANCING
    treeWorldXZ = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
  #endif

  float treePhase = dot( treeWorldXZ, vec2( 0.11, 0.085 ) );
  float heightWeight = smoothstep( 0.25, 6.2, position.y );

  float primaryWave = sin( uWindTime * 1.45 + treePhase );
  float gustWave = sin( uWindTime * 0.6 + treePhase * 0.45 + 1.3 ) * 0.42;
  float swayAmt = ( primaryWave + gustWave ) * 0.13 * uWindStrength * heightWeight;

  float cardFlutter = sin( uWindTime * 2.95 + position.x * 2.0 + position.z * 1.8 + position.y * 1.25 + treePhase * 1.7 )
    * 0.042 * uWindStrength * heightWeight;

  transformed.x += uWindDirection.x * swayAmt + cardFlutter;
  transformed.z += uWindDirection.y * swayAmt + cardFlutter * 0.78;
  transformed.y += sin( uWindTime * 2.15 + position.x * 1.45 + treePhase ) * 0.025 * uWindStrength * heightWeight;
}
`;

const LEAF_WORLD_NORMAL_VERTEX = /* glsl */ `
#include <project_vertex>
{
  vec3 leafWN = objectNormal;
  #ifdef USE_INSTANCING
    leafWN = mat3( instanceMatrix ) * leafWN;
  #endif
  vLeafWorldNormal = normalize( mat3( modelMatrix ) * leafWN );
}
`;

const LEAF_SUN_RIM_FRAG_PARS = /* glsl */ `
#include <common>
varying vec3 vLeafWorldNormal;
uniform vec3 uSunDirection;
uniform vec3 uSunRimColor;
uniform float uSunRimIntensity;
`;

// Preserve upward-bent transferred normals on BOTH faces of DoubleSide leaf cards
const DOUBLE_SIDED_TRANSFERRED_NORMAL_CHUNK = /* glsl */ `
float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
vec3 normal = normalize( vNormal );
vec3 nonPerturbedNormal = normal;
`;

// Subtle warm sunlit rim-glow hugging ONLY the sun-facing top crown silhouette edges
// so mid-crowns stay deep and saturated while outer sunlit rims glow softly like painted anime clouds
const LEAF_SUN_RIM_FRAGMENT = /* glsl */ `
{
  vec3 leafWN = normalize( vLeafWorldNormal );
  vec3 leafViewDir = normalize( vViewPosition );
  float leafNdotV = clamp( dot( normalize( normal ), leafViewDir ), 0.0, 1.0 );
  float sunAlign = smoothstep( 0.22, 0.85, dot( leafWN, normalize( uSunDirection ) ) );
  float topCrown = smoothstep( 0.36, 0.88, leafWN.y );
  float edgeFresnel = pow( 1.0 - leafNdotV, 2.6 );
  float warmRimGlow = sunAlign * topCrown * ( 0.06 + 0.94 * edgeFresnel );
  outgoingLight += uSunRimColor * ( warmRimGlow * uSunRimIntensity );
}
#include <opaque_fragment>
`;

function attachLeafCardShader(
  material: THREE.MeshToonMaterial,
  windUniforms: TreeWindUniforms,
  sunRim: SunRimOptions,
  cacheTag: string,
): void {
  const prevCompile = material.onBeforeCompile.bind(material);
  const prevCacheKey = material.customProgramCacheKey.bind(material);

  const sunRimUniforms = {
    uSunDirection: { value: sunRim.sunDirection.clone().normalize() },
    uSunRimColor: { value: new THREE.Color(sunRim.rimColor) },
    uSunRimIntensity: { value: sunRim.rimIntensity },
  };

  material.customProgramCacheKey = () => `${prevCacheKey()}-${cacheTag}`;
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile(shader, renderer);
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindDirection = windUniforms.uWindDirection;
    shader.uniforms.uSunDirection = sunRimUniforms.uSunDirection;
    shader.uniforms.uSunRimColor = sunRimUniforms.uSunRimColor;
    shader.uniforms.uSunRimIntensity = sunRimUniforms.uSunRimIntensity;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', WIND_VERTEX_PARS)
      .replace('#include <begin_vertex>', WIND_BEGIN_VERTEX)
      .replace('#include <project_vertex>', LEAF_WORLD_NORMAL_VERTEX);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', LEAF_SUN_RIM_FRAG_PARS)
      .replace('#include <normal_fragment_begin>', DOUBLE_SIDED_TRANSFERRED_NORMAL_CHUNK)
      .replace('#include <opaque_fragment>', LEAF_SUN_RIM_FRAGMENT);
  };
  material.userData.windUniforms = windUniforms;
  material.userData.sunRimUniforms = sunRimUniforms;
}

function createWindLeafDepthMaterial(
  leafMap: THREE.Texture,
  windUniforms: TreeWindUniforms,
  cacheTag: string,
): THREE.MeshDepthMaterial {
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: leafMap,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  depthMat.customProgramCacheKey = () => cacheTag;
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindDirection = windUniforms.uWindDirection;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', DEPTH_WIND_VERTEX_PARS)
      .replace('#include <begin_vertex>', WIND_BEGIN_VERTEX);
  };
  return depthMat;
}

// ---------------------------------------------------------------------------
// 5. Seeded Placement, Hero Trio Framing & Low Mossy Root Shrub Assembly
// ---------------------------------------------------------------------------

interface TreePlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  scaleY: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  archetype: TreeArchetypeKind;
  canopyTint: THREE.Color;
  barkTint: THREE.Color;
}

function isInsideSpawnVistaCorridor(x: number, z: number): boolean {
  if (x > -24 && x < 24 && z > -18 && z < 34) {
    const corridorCenterX = (z - 12) * -0.45;
    if (Math.abs(x - corridorCenterX) < 9.5) {
      return true;
    }
  }
  return false;
}

/**
 * Scatters 55–62 high-end painterly Genshin Impact anime trees across Azure Vale with:
 * - Zero heavy black outlines on trunks or foliage
 * - 256–276 fine, feathery alpha-cutout leaf-cluster cards (`alphaTest: 0.4`) per tree
 * - Soft luminous upward-bent normal transfer & live rolling wind sway
 * - 3 vibrant color varieties: Deep Teal-Emerald, Pastel Sakura Pink, Warm Golden-Amber
 * - Low feathery mossy shrubs clustered snugly around tree roots
 */
export function createTrees(
  scene: THREE.Scene,
  options: CreateTreesOptions = {},
): TreesController {
  const root = new THREE.Group();
  root.name = 'fluffyAnimeTrees';
  scene.add(root);

  const sunDirection = (
    options.sunDirection?.clone() ?? new THREE.Vector3(95, 108, 65)
  ).normalize();

  const spawn = getSpawnCenter();
  const bridge = getBridgeAnchor();
  const ruins = getRuinsCenter();
  const overlook = getOverlookCenter();
  const toriiPos = new THREE.Vector2(24.5, -7.0);

  const windUniforms: TreeWindUniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 1.0 },
    uWindDirection: { value: new THREE.Vector2(0.86, 0.51).normalize() },
  };

  // Procedural 512x512 multi-layered soft rounded botanical leaf-cluster textures
  const frondMap = createLeafClusterTexture('featheryFrond');
  const sakuraMap = createLeafClusterTexture('sakuraSpray');
  const goldenMap = createLeafClusterTexture('goldenSprig');

  // Natural painterly mossy-base bark material (NO harsh black outline)
  const trunkMat = createAnimeToonMaterial(TREE_COLORS.trunkBark, {
    steps: 3,
    vertexColors: true,
    gradientStops: [110, 142, 174, 206, 232, 255],
    shadowTint: '#2b3d3a',
    shadowTintStrength: 0.28,
    rimColor: '#e8f5c8',
    rimPower: 4.5,
    rimIntensity: 0.14,
  });

  // Rich painterly 6-step luminous foliage materials (alphaTest: 0.4, DoubleSide + crisp sun-facing top rim-glow)
  const deepTealMat = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    map: frondMap,
    side: THREE.DoubleSide,
    gradientStops: [68, 108, 152, 194, 228, 255],
    shadowTint: '#043540',
    shadowTintStrength: 0.42,
    emissive: '#083b26',
    emissiveIntensity: 0.015,
    rimColor: '#9eff8a',
    rimPower: 5.5,
    rimIntensity: 0.06,
    rimSmoothness: 0.2,
  });
  deepTealMat.alphaTest = 0.4;
  attachLeafCardShader(
    deepTealMat,
    windUniforms,
    { sunDirection, rimColor: '#e4ff96', rimIntensity: 0.24 },
    'anime-pillowy-teal-v8',
  );

  const pastelSakuraMat = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    map: sakuraMap,
    side: THREE.DoubleSide,
    gradientStops: [96, 134, 170, 206, 234, 255],
    shadowTint: '#7a4fb8',
    shadowTintStrength: 0.38,
    emissive: '#e678c4',
    emissiveIntensity: 0.02,
    rimColor: '#fff0fa',
    rimPower: 5.0,
    rimIntensity: 0.07,
    rimSmoothness: 0.2,
  });
  pastelSakuraMat.alphaTest = 0.4;
  attachLeafCardShader(
    pastelSakuraMat,
    windUniforms,
    { sunDirection, rimColor: '#fff2dc', rimIntensity: 0.22 },
    'anime-pillowy-sakura-v8',
  );

  const goldenAmberMat = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    map: goldenMap,
    side: THREE.DoubleSide,
    gradientStops: [80, 122, 164, 204, 234, 255],
    shadowTint: '#9c3b00',
    shadowTintStrength: 0.42,
    emissive: '#e68000',
    emissiveIntensity: 0.02,
    rimColor: '#fff275',
    rimPower: 5.0,
    rimIntensity: 0.08,
    rimSmoothness: 0.2,
  });
  goldenAmberMat.alphaTest = 0.4;
  attachLeafCardShader(
    goldenAmberMat,
    windUniforms,
    { sunDirection, rimColor: '#fff49c', rimIntensity: 0.28 },
    'anime-pillowy-amber-v8',
  );

  const mossyShrubMat = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    map: frondMap,
    side: THREE.DoubleSide,
    gradientStops: [78, 118, 160, 200, 232, 255],
    shadowTint: '#084236',
    shadowTintStrength: 0.38,
    emissive: '#145822',
    emissiveIntensity: 0.015,
    rimColor: '#caff7a',
    rimPower: 5.2,
    rimIntensity: 0.06,
  });
  mossyShrubMat.alphaTest = 0.4;
  attachLeafCardShader(
    mossyShrubMat,
    windUniforms,
    { sunDirection, rimColor: '#e8ffa0', rimIntensity: 0.18 },
    'anime-pillowy-shrub-v8',
  );

  const ridgeTreeMat = createAnimeToonMaterial('#ffffff', {
    steps: 3,
    vertexColors: true,
    map: frondMap,
    side: THREE.DoubleSide,
    gradientStops: [88, 128, 168, 206, 234, 255],
    shadowTint: '#125a58',
    shadowTintStrength: 0.36,
    emissive: '#0e4c36',
    emissiveIntensity: 0.02,
    rimColor: '#d0ffb2',
    rimPower: 5.2,
    rimIntensity: 0.07,
  });
  ridgeTreeMat.alphaTest = 0.4;
  attachLeafCardShader(
    ridgeTreeMat,
    windUniforms,
    { sunDirection, rimColor: '#f0ffba', rimIntensity: 0.2 },
    'anime-pillowy-ridge-v8',
  );

  const frondDepthMat = createWindLeafDepthMaterial(
    frondMap,
    windUniforms,
    'anime-pillowy-frond-depth-v7',
  );
  const sakuraDepthMat = createWindLeafDepthMaterial(
    sakuraMap,
    windUniforms,
    'anime-pillowy-sakura-depth-v7',
  );
  const goldenDepthMat = createWindLeafDepthMaterial(
    goldenMap,
    windUniforms,
    'anime-pillowy-golden-depth-v7',
  );

  // Subtle natural hue variations multiplied against the baked per-archetype crown colors
  const tealTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#eefcf4'),
    new THREE.Color('#e2f7f0'),
    new THREE.Color('#f4ffea'),
  ];
  const sakuraTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#fff2fa'),
    new THREE.Color('#fce8ff'),
  ];
  const amberTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#fff6dc'),
    new THREE.Color('#ffefc4'),
  ];
  const barkTints = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#f0e5da'),
    new THREE.Color('#e6d9ce'),
  ];

  const rng = mulberry32(WORLD_SEED + 331);
  const placements: TreePlacement[] = [];
  const colliders: TreeCollider[] = [];

  const canPlaceTree = (
    x: number,
    z: number,
    minSpacing: number,
    allowHeroTighter = false,
  ): boolean => {
    if (getTerrainBiomeAt(x, z) !== 'meadow') return false;
    if (getTerrainSlope(x, z) > (allowHeroTighter ? 0.34 : 0.28)) return false;
    if (getRiverSignedDistance(x, z) < (allowHeroTighter ? 4.0 : 5.6)) return false;
    if (getPathDistance(x, z) < (allowHeroTighter ? 4.2 : 5.2)) return false;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 11.5) return false;
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 11.2) return false;
    if (Math.hypot(x - ruins.x, z - ruins.z) < (allowHeroTighter ? 11.5 : 13.0)) return false;
    if (Math.hypot(x - overlook.x, z - overlook.z) < (allowHeroTighter ? 9.5 : 11.2)) return false;
    if (Math.hypot(x - toriiPos.x, z - toriiPos.y) < 7.2) return false;
    if (!allowHeroTighter && isInsideSpawnVistaCorridor(x, z)) return false;

    for (let i = 0; i < placements.length; i += 1) {
      if (Math.hypot(placements[i].x - x, placements[i].z - z) < minSpacing) {
        return false;
      }
    }
    return true;
  };

  const pushPlacement = (
    x: number,
    z: number,
    scale: number,
    archetype: TreeArchetypeKind,
    yaw: number,
  ): void => {
    const groundY = getTerrainHeight(x, z);
    const slope = getTerrainSlope(x, z);
    const y = groundY - (0.16 + slope * 0.44);
    const scaleY = scale * (0.95 + rng() * 0.12);

    const canopyTint =
      archetype === 'pastelSakura'
        ? sakuraTints[Math.floor(rng() * sakuraTints.length)]
        : archetype === 'goldenAmber'
          ? amberTints[Math.floor(rng() * amberTints.length)]
          : tealTints[Math.floor(rng() * tealTints.length)];
    const barkTint = barkTints[Math.floor(rng() * barkTints.length)];

    placements.push({
      x,
      y,
      z,
      scale,
      scaleY,
      yaw,
      tiltX: (rng() - 0.5) * 0.05,
      tiltZ: (rng() - 0.5) * 0.05,
      archetype,
      canopyTint,
      barkTint,
    });

    const baseTrunkRadius =
      archetype === 'deepTeal' ? 0.54 : archetype === 'pastelSakura' ? 0.48 : 0.44;
    colliders.push({
      x,
      y: groundY,
      z,
      radius: baseTrunkRadius * scale,
      height: (archetype === 'pastelSakura' ? 6.8 : archetype === 'deepTeal' ? 5.8 : 4.6) * scaleY,
      archetype,
    });
  };

  // 1. Hand-placed Hero Meadow Trio & Scenic Framing Trees
  // Notice the iconic 3-tree composition in the sunlit eastern meadow glade (~x: 16..29, z: 12..19):
  // Left: wide deep teal-emerald | Center-Right: tall pastel sakura pink | Far-Right: warm golden-amber
  const heroTrees: ReadonlyArray<{
    x: number;
    z: number;
    scale: number;
    archetype: TreeArchetypeKind;
    yaw: number;
  }> = [
    // Iconic foreground hero meadow trio (visible from both main vista and ?view=trees)
    { x: 16.5, z: 16.0, scale: 1.32, archetype: 'deepTeal', yaw: 0.4 },
    { x: 24.8, z: 12.6, scale: 1.28, archetype: 'pastelSakura', yaw: -0.5 },
    { x: 28.4, z: 16.8, scale: 1.06, archetype: 'goldenAmber', yaw: 1.1 },

    // Hilltop Ancient Ruins framing (sakura + golden + teal)
    { x: ruins.x + 12.2, z: ruins.z - 5.2, scale: 1.24, archetype: 'pastelSakura', yaw: 2.2 },
    { x: ruins.x - 12.4, z: ruins.z - 6.8, scale: 1.2, archetype: 'pastelSakura', yaw: -0.75 },
    { x: ruins.x + 14.5, z: ruins.z + 6.5, scale: 1.05, archetype: 'goldenAmber', yaw: 0.45 },

    // Tranquil pond & riverbend accents
    { x: 6.5, z: -34.2, scale: 1.26, archetype: 'pastelSakura', yaw: 0.9 },
    { x: -16.8, z: -26.5, scale: 1.2, archetype: 'pastelSakura', yaw: 1.7 },
    { x: -12.5, z: -35.8, scale: 1.12, archetype: 'goldenAmber', yaw: -1.3 },
    { x: -24.0, z: -18.5, scale: 1.26, archetype: 'deepTeal', yaw: -1.1 },

    // Scenic overlook & valley framing
    { x: overlook.x - 10.5, z: overlook.z + 6.8, scale: 1.24, archetype: 'pastelSakura', yaw: 0.35 },
    { x: overlook.x + 10.8, z: overlook.z - 9.2, scale: 1.16, archetype: 'goldenAmber', yaw: 2.4 },
    { x: 14.2, z: 3.5, scale: 1.15, archetype: 'deepTeal', yaw: 1.4 },
    { x: -25.8, z: 19.5, scale: 1.25, archetype: 'deepTeal', yaw: -0.6 },
    { x: -17.5, z: 38.2, scale: 1.14, archetype: 'goldenAmber', yaw: 0.8 },
  ];

  for (const h of heroTrees) {
    if (canPlaceTree(h.x, h.z, 5.2, true)) {
      pushPlacement(h.x, h.z, h.scale, h.archetype, h.yaw);
    }
  }

  // 2. Seeded natural valley groves across all 3 vibrant tree varieties
  const targetTotalTrees = 58;
  for (let attempt = 0; attempt < 2400 && placements.length < targetTotalTrees; attempt += 1) {
    const x = (rng() - 0.5) * 194;
    const z = (rng() - 0.5) * 194;
    const minSpacing = 10.5 + rng() * 4.0;
    if (!canPlaceTree(x, z, minSpacing, false)) continue;

    const roll = rng();
    const archetype: TreeArchetypeKind =
      roll < 0.54 ? 'deepTeal' : roll < 0.78 ? 'pastelSakura' : 'goldenAmber';

    const scale =
      archetype === 'pastelSakura'
        ? 0.98 + rng() * 0.34
        : archetype === 'deepTeal'
          ? 1.0 + rng() * 0.38
          : 0.9 + rng() * 0.32;

    pushPlacement(x, z, scale, archetype, rng() * Math.PI * 2);
  }

  // 3. Build & mount instanced trunks (NO black outlines) + 250+ card feathery canopies
  const archetypes: readonly TreeArchetypeKind[] = [
    'deepTeal',
    'pastelSakura',
    'goldenAmber',
  ];
  const dummy = new THREE.Object3D();

  const canopyMatByKind: Record<TreeArchetypeKind, THREE.MeshToonMaterial> = {
    deepTeal: deepTealMat,
    pastelSakura: pastelSakuraMat,
    goldenAmber: goldenAmberMat,
  };
  const depthMatByKind: Record<TreeArchetypeKind, THREE.MeshDepthMaterial> = {
    deepTeal: frondDepthMat,
    pastelSakura: sakuraDepthMat,
    goldenAmber: goldenDepthMat,
  };

  const counts: Record<TreeArchetypeKind, number> = {
    deepTeal: 0,
    pastelSakura: 0,
    goldenAmber: 0,
  };
  const cardsPerArchetype: Record<TreeArchetypeKind, number> = {
    deepTeal: getCanopyCardCount('deepTeal'),
    pastelSakura: getCanopyCardCount('pastelSakura'),
    goldenAmber: getCanopyCardCount('goldenAmber'),
  };

  for (const kind of archetypes) {
    const group = placements.filter((p) => p.archetype === kind);
    counts[kind] = group.length;
    if (group.length === 0) continue;

    const trunkGeo = createTreeTrunkGeometry(kind);
    const canopyGeo = createFluffyCanopyGeometry(kind);

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, group.length);
    trunkMesh.name = `animeTreeTrunks_${kind}`;
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const canopyMesh = new THREE.InstancedMesh(
      canopyGeo,
      canopyMatByKind[kind],
      group.length,
    );
    canopyMesh.name = `animeTreeCanopies_${kind}`;
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    canopyMesh.customDepthMaterial = depthMatByKind[kind];

    for (let i = 0; i < group.length; i += 1) {
      const p = group[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.tiltX, p.yaw, p.tiltZ);
      dummy.scale.set(p.scale, p.scaleY, p.scale);
      dummy.updateMatrix();

      trunkMesh.setMatrixAt(i, dummy.matrix);
      trunkMesh.setColorAt(i, p.barkTint);

      canopyMesh.setMatrixAt(i, dummy.matrix);
      canopyMesh.setColorAt(i, p.canopyTint);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    trunkMesh.computeBoundingSphere();

    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
    canopyMesh.computeBoundingSphere();

    root.add(trunkMesh, canopyMesh);
  }

  // 4. Low Feathery Mossy Shrubs Clustered Around Tree Roots & Foreground Glades
  const shrubGeo = createMossyShrubGeometry();
  const shrubRng = mulberry32(WORLD_SEED + 5119);
  const shrubMatrices: THREE.Matrix4[] = [];
  const shrubColors: THREE.Color[] = [];
  const shrubPalette = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#ecffe0'),
    new THREE.Color('#dcf5e4'),
    new THREE.Color('#f2ffd4'),
  ];

  for (let tIdx = 0; tIdx < placements.length; tIdx += 1) {
    const tree = placements[tIdx];
    const shrubsForTree = tIdx < 3 ? 3 : 2;
    for (let s = 0; s < shrubsForTree; s += 1) {
      const angle = (s / shrubsForTree) * Math.PI * 2 + shrubRng() * 1.4;
      const dist = (1.15 + shrubRng() * 1.45) * tree.scale;
      const sx = tree.x + Math.cos(angle) * dist;
      const sz = tree.z + Math.sin(angle) * dist;

      if (getTerrainBiomeAt(sx, sz) !== 'meadow') continue;
      if (getPathDistance(sx, sz) < 2.8) continue;
      if (getRiverSignedDistance(sx, sz) < 2.2) continue;

      const groundY = getTerrainHeight(sx, sz);
      const scaleXZ = 0.92 + shrubRng() * 0.82;
      const scaleY = 0.78 + shrubRng() * 0.68;

      dummy.position.set(sx, groundY - 0.16, sz);
      dummy.rotation.set(0, shrubRng() * Math.PI * 2, 0);
      dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      dummy.updateMatrix();
      shrubMatrices.push(dummy.matrix.clone());
      shrubColors.push(shrubPalette[Math.floor(shrubRng() * shrubPalette.length)]);
    }
  }

  // Extra lush mossy meadow shrubs framing the hero trio foreground (matching left-foreground shrubs in reference)
  const heroShrubSpots: ReadonlyArray<readonly [number, number, number]> = [
    [15.6, 18.0, 1.55],
    [18.2, 19.8, 1.48],
    [19.8, 20.6, 1.38],
    [23.2, 15.6, 1.12],
    [27.2, 18.0, 1.18],
  ];
  for (const [sx, sz, sc] of heroShrubSpots) {
    if (getTerrainBiomeAt(sx, sz) !== 'meadow') continue;
    const groundY = getTerrainHeight(sx, sz);
    dummy.position.set(sx, groundY - 0.14, sz);
    dummy.rotation.set(0, shrubRng() * Math.PI * 2, 0);
    dummy.scale.set(sc * 1.15, sc * 0.92, sc);
    dummy.updateMatrix();
    shrubMatrices.push(dummy.matrix.clone());
    shrubColors.push(shrubPalette[0]);
  }

  const shrubMesh = new THREE.InstancedMesh(
    shrubGeo,
    mossyShrubMat,
    Math.max(1, shrubMatrices.length),
  );
  shrubMesh.name = 'mossyTreeRootShrubs';
  shrubMesh.castShadow = true;
  shrubMesh.receiveShadow = true;
  shrubMesh.customDepthMaterial = frondDepthMat;
  for (let i = 0; i < shrubMatrices.length; i += 1) {
    shrubMesh.setMatrixAt(i, shrubMatrices[i]);
    shrubMesh.setColorAt(i, shrubColors[i]);
  }
  shrubMesh.instanceMatrix.needsUpdate = true;
  if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;
  shrubMesh.computeBoundingSphere();
  root.add(shrubMesh);

  // 5. Distant Ridge-Line Tree Clusters Framing the Horizon Hills (Lush, Deep Treeline)
  const ridgeRng = mulberry32(WORLD_SEED + 6229);
  const ridgeMatrices: THREE.Matrix4[] = [];
  const ridgeColors: THREE.Color[] = [];
  const ridgePositions: Array<{ x: number; z: number }> = [];
  const ridgePalette = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#e6ffe4'),
    new THREE.Color('#d2f5ea'),
    new THREE.Color('#f0ffd8'),
    new THREE.Color('#c8f0e4'),
  ];

  // Hand-curated lush ridge-line woodland groves lining the distant hills & hero vista horizon
  const ridgeClusterAnchors: ReadonlyArray<readonly [number, number, number]> = [
    [16, -24, 5],   // Lush mid-background woodland behind the hero 3-tree meadow glade
    [35, -14, 5],   // Right-mid distant woodland behind golden-amber & sakura trees
    [54, -56, 7],   // Northeast rolling hillside woodland
    [28, -76, 7],   // North-northeast ridge crest
    [6, -86, 7],    // Northern valley horizon crest
    [-18, -86, 7],  // North-northwest hill crest
    [-48, -72, 7],  // Far northwest rolling ridge
    [-76, -48, 6],  // Northwest outer hill
    [-94, -18, 6],  // Western ridge horizon
    [-86, 36, 5],   // Southwest forested knoll
    [76, -34, 7],   // Far northeast/east forested ridge
    [86, 18, 6],    // Southeast forested ridge
    [42, 76, 5],    // Southern ridge backdrop
    [-46, 84, 5],   // Southwest horizon ridge
  ];

  const tryPushRidgeTree = (x: number, z: number, scaleMin: number, scaleMax: number): boolean => {
    if (Math.abs(x) > 138 || Math.abs(z) > 138) return false;
    if (getRiverSignedDistance(x, z) < 6.5) return false;
    if (getPathDistance(x, z) < 5.0) return false;
    if (getTerrainSlope(x, z) > 0.52) return false;
    const groundY = getTerrainHeight(x, z);
    if (groundY < 1.2) return false;

    for (let i = 0; i < ridgePositions.length; i += 1) {
      if (Math.hypot(ridgePositions[i].x - x, ridgePositions[i].z - z) < 4.6) {
        return false;
      }
    }
    for (let i = 0; i < placements.length; i += 1) {
      if (Math.hypot(placements[i].x - x, placements[i].z - z) < 5.6) {
        return false;
      }
    }

    const sc = scaleMin + ridgeRng() * (scaleMax - scaleMin);
    const scY = sc * (0.84 + ridgeRng() * 0.24);
    // Nestle ridge trees deeper into the hill slope so overlapping crowns form lush continuous woodland
    dummy.position.set(x, groundY - 0.95 - getTerrainSlope(x, z) * 0.85, z);
    dummy.rotation.set(0, ridgeRng() * Math.PI * 2, 0);
    dummy.scale.set(sc * 1.12, scY, sc * 1.12);
    dummy.updateMatrix();

    ridgeMatrices.push(dummy.matrix.clone());
    ridgeColors.push(ridgePalette[Math.floor(ridgeRng() * ridgePalette.length)]);
    ridgePositions.push({ x, z });
    return true;
  };

  for (const [ax, az, count] of ridgeClusterAnchors) {
    for (let k = 0; k < count * 3 && ridgeMatrices.length < 124; k += 1) {
      const ang = ridgeRng() * Math.PI * 2;
      const dist = k === 0 ? 0 : 3.8 + ridgeRng() * 15.5;
      tryPushRidgeTree(ax + Math.cos(ang) * dist, az + Math.sin(ang) * dist, 1.15, 1.92);
    }
  }

  // Additional organic ridge-line woodland clusters ringing the outer horizon hills (r = 78..132)
  for (let attempt = 0; attempt < 1100 && ridgeMatrices.length < 124; attempt += 1) {
    const theta = ridgeRng() * Math.PI * 2;
    const rad = 78 + ridgeRng() * 52;
    const cx = Math.cos(theta) * rad;
    const cz = Math.sin(theta) * rad;
    if (getTerrainHeight(cx, cz) < 5.5) continue;

    const clusterSize = 3 + Math.floor(ridgeRng() * 3);
    for (let k = 0; k < clusterSize && ridgeMatrices.length < 124; k += 1) {
      const ang = ridgeRng() * Math.PI * 2;
      const r = k === 0 ? 0 : 4.2 + ridgeRng() * 9.0;
      tryPushRidgeTree(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, 1.25, 2.02);
    }
  }

  const ridgeTrunkGeo = createTreeTrunkGeometry('goldenAmber');
  const ridgeCanopyGeo = createRidgeCanopyGeometry();

  const ridgeTrunkMesh = new THREE.InstancedMesh(
    ridgeTrunkGeo,
    trunkMat,
    Math.max(1, ridgeMatrices.length),
  );
  ridgeTrunkMesh.name = 'distantRidgeTreeTrunks';
  ridgeTrunkMesh.castShadow = false;
  ridgeTrunkMesh.receiveShadow = true;

  const ridgeCanopyMesh = new THREE.InstancedMesh(
    ridgeCanopyGeo,
    ridgeTreeMat,
    Math.max(1, ridgeMatrices.length),
  );
  ridgeCanopyMesh.name = 'distantRidgeTreeCanopies';
  ridgeCanopyMesh.castShadow = false;
  ridgeCanopyMesh.receiveShadow = true;

  for (let i = 0; i < ridgeMatrices.length; i += 1) {
    ridgeTrunkMesh.setMatrixAt(i, ridgeMatrices[i]);
    ridgeTrunkMesh.setColorAt(i, barkTints[i % barkTints.length]);
    ridgeCanopyMesh.setMatrixAt(i, ridgeMatrices[i]);
    ridgeCanopyMesh.setColorAt(i, ridgeColors[i]);
  }
  ridgeTrunkMesh.instanceMatrix.needsUpdate = true;
  if (ridgeTrunkMesh.instanceColor) ridgeTrunkMesh.instanceColor.needsUpdate = true;
  ridgeTrunkMesh.computeBoundingSphere();

  ridgeCanopyMesh.instanceMatrix.needsUpdate = true;
  if (ridgeCanopyMesh.instanceColor) ridgeCanopyMesh.instanceColor.needsUpdate = true;
  ridgeCanopyMesh.computeBoundingSphere();

  root.add(ridgeTrunkMesh, ridgeCanopyMesh);

  const setWindStrength = (strength: number): void => {
    windUniforms.uWindStrength.value = THREE.MathUtils.clamp(strength, 0, 3);
  };

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
        if (obj.customDepthMaterial && !disposedMats.has(obj.customDepthMaterial)) {
          disposedMats.add(obj.customDepthMaterial);
          obj.customDepthMaterial.dispose();
        }
      }
    });

    frondMap.dispose();
    sakuraMap.dispose();
    goldenMap.dispose();
  };

  return {
    root,
    colliders,
    stats: {
      deepTeal: counts.deepTeal,
      pastelSakura: counts.pastelSakura,
      goldenAmber: counts.goldenAmber,
      mossyShrubs: shrubMatrices.length,
      ridgeTrees: ridgeMatrices.length,
      totalTrees: placements.length,
      colliders: colliders.length,
      cardsPerArchetype,
    },
    windUniforms,
    setWindStrength,
    update,
    dispose,
  };
}
