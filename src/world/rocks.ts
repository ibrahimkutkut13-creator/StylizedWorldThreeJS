import * as THREE from 'three';
import {
  TERRAIN_HALF_SIZE,
  WATER_LEVEL,
  WORLD_SEED,
  createSimplex2D,
  getBridgeAnchor,
  getOverlookCenter,
  getPathDistance,
  getRiverSignedDistance,
  getRuinsCenter,
  getSpawnCenter,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainSlope,
} from './terrain';
import {
  computeSmoothNormalsAttribute,
  createAnimeToonMaterial,
  createInkOutlineMaterial,
} from './toonMaterials';
import type { WaterController } from './water';

/**
 * Canonical stylized Genshin-inspired cliff & boulder palette (sRGB hex).
 */
export const ROCK_COLORS = {
  slateDark: '#8493c9',
  slateMid: '#95a3d6',
  limestone: '#a9b2c9',
  mossCap: '#6ccb5f',
  sunlitGrass: '#7ee05a',
  outline: '#1e1633',
} as const;

export type RockArchetypeKind =
  | 'cliffWallSlab'
  | 'cliffOutcrop'
  | 'riverBoulder'
  | 'pathStone';

export interface RockCollider {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly kind: RockArchetypeKind;
}

export interface RocksStats {
  readonly cliffWallSlabs: number;
  readonly cliffOutcrops: number;
  readonly riverBoulders: number;
  readonly pathStones: number;
  readonly totalRocks: number;
  readonly colliders: number;
}

export interface RocksController {
  readonly root: THREE.Group;
  readonly colliders: readonly RockCollider[];
  readonly stats: RocksStats;
  dispose: () => void;
}

export interface BeveledRockOptions {
  seed: number;
  baseShape?: 'dodecahedron' | 'icosahedron';
  detail?: number;
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  flattenTop?: boolean;
  topCapRatio?: number;
  strataFreq?: number;
  strataStrength?: number;
  warpStrength?: number;
  taperTop?: number;
}

const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {};

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
 * Builds a high-resolution, sculpted Genshin Impact-style rock or terraced cliff slab
 * using subdivided geometry (`detail: 3` default) deformed with:
 * - 2-octave domain-warped Simplex noise for angular fractured geological ridges
 * - Layered horizontal sedimentary strata steps & cantilevered overhangs
 * - Flat-topped plateau carving for lush grassy cliff crowns
 * - `.toNonIndexed()` + `computeVertexNormals()` for razor-sharp chiseled cel-shaded planes
 * - Watertight `aSmoothNormal` precomputation for crack-free `#1e1633` plum-ink outlines
 */
export function createBeveledRockGeometry(
  options: BeveledRockOptions,
): THREE.BufferGeometry {
  const {
    seed,
    baseShape = 'icosahedron',
    detail = 3,
    radiusX,
    radiusY,
    radiusZ,
    flattenTop = true,
    topCapRatio = 0.62,
    strataFreq = 6.2,
    strataStrength = 0.14,
    warpStrength = 0.24,
    taperTop = 0.14,
  } = options;

  const warpNoiseA = createSimplex2D(seed + 13);
  const warpNoiseB = createSimplex2D(seed + 97);
  const ridgeNoise = createSimplex2D(seed + 251);
  const strataNoise = createSimplex2D(seed + 419);

  const rawGeo =
    baseShape === 'dodecahedron'
      ? new THREE.DodecahedronGeometry(1, detail)
      : new THREE.IcosahedronGeometry(1, detail);

  // Convert to non-indexed so every chiseled triangle gets razor-sharp planar cel normals
  const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
  if (geo !== rawGeo) rawGeo.dispose();

  const pos = geo.attributes.position;

  // Weld displacement by shared quantized vertex position so the outer hull remains 100% watertight
  const displacedMap = new Map<string, [number, number, number]>();

  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const key = `${Math.round(vx * 1e4)},${Math.round(vy * 1e4)},${Math.round(vz * 1e4)}`;

    let displaced = displacedMap.get(key);
    if (!displaced) {
      // Domain-warped 3D-projected coordinates for organic geological fracture planes
      const wx = warpNoiseA(vx * 1.45 + vy * 0.7, vz * 1.45 - vy * 0.55) * warpStrength;
      const wz = warpNoiseB(vz * 1.45 - vy * 0.6, vx * 1.45 + vy * 0.65) * warpStrength;

      // Angular ridged fracture displacement (Valorant / Genshin chiseled facets)
      const n1 = ridgeNoise((vx + wx) * 1.65, (vz + wz) * 1.65 + vy * 0.85);
      const n2 = ridgeNoise((vx - wz) * 3.1 + 4.2, (vz + wx) * 3.1 - vy * 1.2);
      const angularRidge = (1.0 - Math.abs(n1)) * 0.2 + n2 * 0.08;

      // Sharp layered horizontal sedimentary rock strata shelves along Y
      const strataWarp = strataNoise(vx * 1.25, vz * 1.25) * 0.42;
      const strataCoord = (vy + 1.0) * strataFreq + strataWarp;
      const strataTier = Math.floor(strataCoord);
      const strataFrac = strataCoord - strataTier;
      // Crisp chiseled geological terrace shelf + angular undercut lip
      const shelfPlate = Math.sin(strataTier * 2.31 + 0.4) * 0.5 + 0.5;
      const crispBevel = THREE.MathUtils.smoothstep(strataFrac, 0.76, 0.9);
      const crispCut = 1.0 - THREE.MathUtils.smoothstep(strataFrac, 0.04, 0.16);
      const ledgeStep = shelfPlate * 0.62 + crispBevel * 0.38 - crispCut * 0.22;
      const strataRadial = (ledgeStep - 0.45) * strataStrength;

      // Subtle architectural taper from wide grounded base toward flat top ledge
      const taper =
        vy > 0.1
          ? 1.0 - (vy - 0.1) * taperTop
          : 1.0 + Math.max(0, -vy) * 0.14;

      const radialScale = Math.max(0.68, (0.88 + angularRidge + strataRadial) * taper);
      const nx = vx * radiusX * radialScale;
      const nz = vz * radiusZ * radialScale;

      let ny = vy * radiusY * (0.94 + n1 * 0.1 + strataRadial * 0.25);

      // Carve a crisp tabletop cliff terrace on top for lush Genshin grass caps
      if (flattenTop && ny > radiusY * topCapRatio) {
        const excess = ny - radiusY * topCapRatio;
        ny = radiusY * topCapRatio + excess * 0.1 + n2 * radiusY * 0.025;
      }
      if (ny < -radiusY * 0.62) {
        ny = -radiusY * 0.62;
      }

      displaced = [nx, ny, nz];
      displacedMap.set(key, displaced);
    }

    pos.setXYZ(i, displaced[0], displaced[1], displaced[2]);
  }

  pos.needsUpdate = true;
  // Translate pivot into lower third so slope embedding anchors towering slabs solidly
  geo.translate(0, radiusY * 0.34, 0);

  // Razor-sharp planar face normals on the non-indexed subdivided triangles
  geo.computeVertexNormals();

  // Watertight angle-weighted smooth normals for crack-free #1e1633 plum-ink outlines
  computeSmoothNormalsAttribute(geo);

  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // Bake per-vertex upper-crown mask (0 on vertical cliff walls, 1 on flat top terrace)
  // so lush grass caps sit cleanly on cliff tops without speckling mid-wall strata ledges
  const bbox = geo.boundingBox!;
  const maxY = bbox.max.y;
  const totalHeight = Math.max(0.001, maxY - bbox.min.y);
  const topCapMask = new Float32Array(pos.count);
  const capStart = maxY - totalHeight * 0.28;
  const capFull = maxY - totalHeight * 0.08;
  for (let i = 0; i < pos.count; i += 1) {
    topCapMask[i] = THREE.MathUtils.smoothstep(pos.getY(i), capStart, capFull);
  }
  geo.setAttribute('aTopCapMask', new THREE.BufferAttribute(topCapMask, 1));

  return geo;
}

// ---------------------------------------------------------------------------
// Custom Sedimentary Strata & Cliff-Top Grass Cap Shader (onBeforeCompile)
// ---------------------------------------------------------------------------

const ROCK_SHADER_VERTEX_PARS = /* glsl */ `
#include <common>
attribute float aTopCapMask;
varying vec3 vRockWorldPos;
varying vec3 vRockWorldNormal;
varying float vRockTopMask;
`;

const ROCK_SHADER_VERTEX_WORLD = /* glsl */ `
#include <project_vertex>
{
  vec4 rockWp = vec4( transformed, 1.0 );
  vec3 rockWn = objectNormal;
  #ifdef USE_INSTANCING
    rockWp = instanceMatrix * rockWp;
    // Exact normal matrix correction for non-uniform instance scaling (orthogonal rot * scale)
    vec3 instScaleSq = vec3(
      max( dot( instanceMatrix[0].xyz, instanceMatrix[0].xyz ), 1e-5 ),
      max( dot( instanceMatrix[1].xyz, instanceMatrix[1].xyz ), 1e-5 ),
      max( dot( instanceMatrix[2].xyz, instanceMatrix[2].xyz ), 1e-5 )
    );
    rockWn = mat3( instanceMatrix ) * ( rockWn / instScaleSq );
  #endif
  rockWp = modelMatrix * rockWp;
  vRockWorldPos = rockWp.xyz;
  vRockWorldNormal = normalize( mat3( modelMatrix ) * rockWn );
  vRockTopMask = aTopCapMask;
}
`;

const ROCK_SHADER_FRAGMENT_PARS = /* glsl */ `
#include <common>
varying vec3 vRockWorldPos;
varying vec3 vRockWorldNormal;
varying float vRockTopMask;
uniform float uGrassCapEnabled;
uniform float uWaterLevel;
uniform vec3 uGrassCapColor;
uniform vec3 uGrassSunColor;
uniform vec3 uStrataDarkTint;
uniform vec3 uStrataLightTint;
`;

const ROCK_SHADER_FRAGMENT_NORMAL = /* glsl */ `
#include <normal_fragment_begin>
{
  vec3 wN = normalize( vRockWorldNormal );
  // Apply crisp chiseled strata normal bevels on rock walls (excluding flat grassy crowns)
  float wallWeight = 1.0 - smoothstep( 0.56, 0.78, abs( wN.y ) );
  if ( wallWeight > 0.01 ) {
    float sWarp =
      sin( vRockWorldPos.x * 0.22 + vRockWorldPos.z * 0.17 ) * 0.58 +
      cos( vRockWorldPos.x * 0.56 - vRockWorldPos.z * 0.49 ) * 0.2;
    float sPhase = fract( vRockWorldPos.y * 0.92 + sWarp );
    float finePhase = fract( vRockWorldPos.y * 2.15 + sWarp * 1.4 );

    // Sharp downward undercut at bedding seam + crisp upward chisel lip along strata shelf
    float undercutBevel = smoothstep( 0.0, 0.05, sPhase ) * ( 1.0 - smoothstep( 0.06, 0.16, sPhase ) );
    float shelfLip = smoothstep( 0.54, 0.62, sPhase ) * ( 1.0 - smoothstep( 0.64, 0.74, sPhase ) );
    float microChisel = ( step( 0.68, finePhase ) - step( 0.86, finePhase ) ) * 0.22;

    float strataVerticalTilt = ( shelfLip * 0.58 - undercutBevel * 0.64 + microChisel ) * wallWeight;
    vec3 worldTilt = vec3( 0.0, strataVerticalTilt, 0.0 );
    vec3 viewTilt = ( viewMatrix * vec4( worldTilt, 0.0 ) ).xyz;
    normal = normalize( normal + viewTilt );
    nonPerturbedNormal = normal;
  }
}
`;

const ROCK_SHADER_FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 wN = normalize( vRockWorldNormal );

  // 1. Crisp world-aligned horizontal sedimentary rock strata bands (Genshin cliff layering)
  float strataWarp =
    sin( vRockWorldPos.x * 0.22 + vRockWorldPos.z * 0.17 ) * 0.58 +
    cos( vRockWorldPos.x * 0.56 - vRockWorldPos.z * 0.49 ) * 0.2;
  float strataCoord = vRockWorldPos.y * 0.92 + strataWarp;
  float strataPhase = fract( strataCoord );

  // Crisp cel-stepped geological strata tinting + sharp recessed bedding line
  float lightBand = step( 0.56, strataPhase ) * ( 1.0 - step( 0.88, strataPhase ) );
  float seamLine = smoothstep( 0.0, 0.05, strataPhase ) * ( 1.0 - smoothstep( 0.06, 0.14, strataPhase ) );
  float coolBand = step( 0.15, strataPhase ) * ( 1.0 - step( 0.44, strataPhase ) );

  vec3 rockBase = diffuseColor.rgb;
  rockBase = mix( rockBase, rockBase * uStrataLightTint, lightBand * 0.46 );
  rockBase = mix( rockBase, rockBase * uStrataDarkTint, coolBand * 0.30 + seamLine * 0.52 );

  // Slight vertical elevation lightening toward sunlit cliff crests
  float crestLift = smoothstep( 1.0, 14.0, vRockWorldPos.y ) * 0.08;
  rockBase *= ( 1.0 + crestLift );

  // 2. Lush green meadow grass cap on upward-facing cliff tops (normal.y > 0.65)
  float edgeBreakup =
    sin( vRockWorldPos.x * 1.15 + vRockWorldPos.z * 0.95 ) * 0.032 +
    cos( vRockWorldPos.x * 2.35 - vRockWorldPos.z * 1.85 ) * 0.018;
  float grassSlopeMask = smoothstep( 0.63, 0.69, wN.y + edgeBreakup );
  float dryHeightMask = smoothstep( uWaterLevel + 0.55, uWaterLevel + 1.35, vRockWorldPos.y );
  float topCrownMask = smoothstep( 0.25, 0.65, vRockTopMask );
  float grassMask = grassSlopeMask * dryHeightMask * topCrownMask * uGrassCapEnabled;

  // Subtle sunlit meadow variation across cliff-top grass caps so they blend naturally with terrain
  float meadowPatch = smoothstep(
    -0.25,
    0.55,
    sin( vRockWorldPos.x * 0.18 - vRockWorldPos.z * 0.14 ) * 0.6 +
    cos( vRockWorldPos.x * 0.34 + vRockWorldPos.z * 0.28 ) * 0.4
  );
  vec3 grassCapRgb = mix( uGrassCapColor, uGrassSunColor, meadowPatch * 0.48 );

  // Crisp narrow moss rim right along the grass-to-cliff lip
  float rimMask = smoothstep( 0.57, 0.64, wN.y + edgeBreakup ) * ( 1.0 - grassSlopeMask ) * dryHeightMask * topCrownMask * uGrassCapEnabled;
  rockBase = mix( rockBase, rockBase * vec3( 0.84, 0.93, 0.86 ), rimMask * 0.5 );

  diffuseColor.rgb = mix( rockBase, grassCapRgb, grassMask );
}
`;

function createStratifiedRockMaterial(
  grassCapEnabled: boolean,
  cacheTag: string,
): THREE.MeshToonMaterial {
  const mat = createAnimeToonMaterial('#ffffff', {
    steps: 2,
    flatShading: true,
    gradientStops: [138, 255],
    shadowTint: '#9a8ec9',
    shadowTintStrength: 0.28,
    rimColor: '#fff9e6',
    rimPower: 3.4,
    rimIntensity: 0.22,
  });

  const rockUniforms = {
    uGrassCapEnabled: { value: grassCapEnabled ? 1.0 : 0.0 },
    uWaterLevel: { value: WATER_LEVEL },
    uGrassCapColor: { value: new THREE.Color(ROCK_COLORS.mossCap) },
    uGrassSunColor: { value: new THREE.Color(ROCK_COLORS.sunlitGrass) },
    uStrataDarkTint: { value: new THREE.Color('#7c87b8') },
    uStrataLightTint: { value: new THREE.Color('#d6dcf0') },
  };

  const prevCompile = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey.bind(mat);

  mat.customProgramCacheKey = () => `${prevKey()}-${cacheTag}`;
  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile(shader, renderer);
    shader.uniforms.uGrassCapEnabled = rockUniforms.uGrassCapEnabled;
    shader.uniforms.uWaterLevel = rockUniforms.uWaterLevel;
    shader.uniforms.uGrassCapColor = rockUniforms.uGrassCapColor;
    shader.uniforms.uGrassSunColor = rockUniforms.uGrassSunColor;
    shader.uniforms.uStrataDarkTint = rockUniforms.uStrataDarkTint;
    shader.uniforms.uStrataLightTint = rockUniforms.uStrataLightTint;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', ROCK_SHADER_VERTEX_PARS)
      .replace('#include <project_vertex>', ROCK_SHADER_VERTEX_WORLD);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', ROCK_SHADER_FRAGMENT_PARS)
      .replace('#include <normal_fragment_begin>', ROCK_SHADER_FRAGMENT_NORMAL)
      .replace('#include <color_fragment>', ROCK_SHADER_FRAGMENT_COLOR);
  };

  mat.userData.rockStrataUniforms = rockUniforms;
  return mat;
}

// ---------------------------------------------------------------------------
// Instanced Outlined Rock Mounting & Placement
// ---------------------------------------------------------------------------

interface RockPlacement {
  matrix: THREE.Matrix4;
  color: THREE.Color;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  kind: RockArchetypeKind;
}

function createOutlinedInstancedRocks(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshToonMaterial,
  placements: readonly RockPlacement[],
  outlineThickness: number,
  parent: THREE.Group,
): { mesh: THREE.InstancedMesh; outline: THREE.InstancedMesh } | null {
  if (placements.length === 0) return null;

  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const outlineMat = createInkOutlineMaterial(outlineThickness, ROCK_COLORS.outline, true);
  const outline = new THREE.InstancedMesh(geometry, outlineMat, placements.length);
  outline.name = `${name}_inkOutline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.raycast = NOOP_RAYCAST;
  outline.userData.isInkOutline = true;

  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    mesh.setMatrixAt(i, p.matrix);
    mesh.setColorAt(i, p.color);
    outline.setMatrixAt(i, p.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  outline.instanceMatrix.needsUpdate = true;
  outline.computeBoundingSphere();

  parent.add(mesh);
  parent.add(outline);
  return { mesh, outline };
}

/**
 * Generates high-resolution, layered, handcrafted Genshin Impact-style cliffs and boulders:
 * 1. Towering terraced rock wall formations (`cliffWallSlab`) built by clustering 3–5 overlapping
 *    subdivided (`detail: 3`) stratified cliff slabs along steep valley walls
 * 2. Cantilevered terraced cliff outcrops (`cliffOutcrop`) framing cliff ledges & hillside shoulders
 * 3. Chiseled riverbank boulders (`riverBoulder`) registering foreground water foam obstacles
 * 4. Clustered path-edge accent stones (`pathStone`) framing winding footpaths cleanly
 *
 * All archetypes render with razor-sharp non-indexed chiseled planes, 2-tone cel shading,
 * custom sedimentary strata bands & lush green cliff-top grass caps (`normal.y > 0.65`),
 * watertight `#1e1633` plum-ink outlines, grounded shadows, and exported collision descriptors.
 */
export function createRocks(
  scene: THREE.Scene,
  water?: WaterController,
): RocksController {
  const root = new THREE.Group();
  root.name = 'stylizedValleyRocks';
  scene.add(root);

  const spawn = getSpawnCenter();
  const bridge = getBridgeAnchor();
  const ruins = getRuinsCenter();
  const overlook = getOverlookCenter();
  const toriiPos = new THREE.Vector2(18, -8);

  const dummy = new THREE.Object3D();
  const normalScratch = new THREE.Vector3();

  // Canonical cool slate / warm limestone rock palette
  const stonePalette = [
    new THREE.Color(ROCK_COLORS.slateDark),
    new THREE.Color(ROCK_COLORS.slateMid),
    new THREE.Color(ROCK_COLORS.limestone),
  ];

  // Stratified 2-tone materials: cliff walls/outcrops wear lush green top grass caps; river/path stones stay clean chiseled slate
  const grassCappedCliffMat = createStratifiedRockMaterial(true, 'rock-strata-grass-v4');
  const chiseledStoneMat = createStratifiedRockMaterial(false, 'rock-strata-slate-v4');

  // 4 distinct high-resolution (detail: 3) sculpted rock/cliff archetypes with sharpened strata ledges
  const cliffWallSlabGeo = createBeveledRockGeometry({
    seed: WORLD_SEED + 17,
    baseShape: 'dodecahedron',
    detail: 3,
    radiusX: 3.15,
    radiusY: 3.45,
    radiusZ: 2.35,
    flattenTop: true,
    topCapRatio: 0.64,
    strataFreq: 5.5,
    strataStrength: 0.16,
    warpStrength: 0.24,
    taperTop: 0.16,
  });

  const cliffOutcropGeo = createBeveledRockGeometry({
    seed: WORLD_SEED + 43,
    baseShape: 'icosahedron',
    detail: 3,
    radiusX: 2.55,
    radiusY: 1.95,
    radiusZ: 2.15,
    flattenTop: true,
    topCapRatio: 0.58,
    strataFreq: 5.8,
    strataStrength: 0.16,
    warpStrength: 0.22,
    taperTop: 0.12,
  });

  const riverBoulderGeo = createBeveledRockGeometry({
    seed: WORLD_SEED + 79,
    baseShape: 'icosahedron',
    detail: 3,
    radiusX: 1.25,
    radiusY: 0.88,
    radiusZ: 1.12,
    flattenTop: true,
    topCapRatio: 0.62,
    strataFreq: 5.0,
    strataStrength: 0.14,
    warpStrength: 0.2,
    taperTop: 0.1,
  });

  const pathStoneGeo = createBeveledRockGeometry({
    seed: WORLD_SEED + 113,
    baseShape: 'icosahedron',
    detail: 3,
    radiusX: 0.72,
    radiusY: 0.52,
    radiusZ: 0.64,
    flattenTop: true,
    topCapRatio: 0.56,
    strataFreq: 4.8,
    strataStrength: 0.13,
    warpStrength: 0.18,
    taperTop: 0.12,
  });

  const cliffWallSlabs: RockPlacement[] = [];
  const cliffOutcrops: RockPlacement[] = [];
  const riverBoulders: RockPlacement[] = [];
  const pathStones: RockPlacement[] = [];
  const colliders: RockCollider[] = [];

  const isClearOfLandmarks = (x: number, z: number, extraMargin = 0): boolean => {
    if (Math.hypot(x - spawn.x, z - spawn.z) < 8.5 + extraMargin) return false;
    if (Math.hypot(x - bridge.position.x, z - bridge.position.z) < 9.5 + extraMargin) return false;
    if (Math.hypot(x - ruins.x, z - ruins.z) < 11.2 + extraMargin) return false;
    if (Math.hypot(x - overlook.x, z - overlook.z) < 9.5 + extraMargin) return false;
    if (Math.hypot(x - toriiPos.x, z - toriiPos.y) < 6.2 + extraMargin) return false;
    return true;
  };

  // -------------------------------------------------------------------------
  // 1. Towering Terraced Rock Walls (Clustered Overlapping Stratified Cliff Slabs)
  // -------------------------------------------------------------------------
  const wallRng = mulberry32(WORLD_SEED + 109);
  const wallClusterCenters: Array<{ x: number; z: number }> = [];

  // Hand-curated dramatic scenic cliff-wall anchors framing the valley vista (north ridge, east hills, pond escarpment)
  const heroWallAnchors: ReadonlyArray<readonly [number, number]> = [
    [-25, -52], // Iconic terraced cliff peak behind the northwest pond
    [52, -48],  // Towering eastern cliff buttress behind the hilltop ruins
    [54, -18],  // Mid-east terraced rock wall framing the valley flank
    [-56, -24], // Western valley rim escarpment
    [-58, 12],  // Southwest steep hillside rock wall
    [48, 22],   // Southeast hillside terraced ledge
    [2, -64],   // Far northern valley backdrop cliffs
    [-40, -64], // Northwest far ridge
  ];

  const trySpawnWallCluster = (cx: number, cz: number, targetSlabs: number): boolean => {
    const slope = getTerrainSlope(cx, cz);
    if (slope < 0.24) return false;
    if (getRiverSignedDistance(cx, cz) < 8.0) return false;
    if (getPathDistance(cx, cz) < 6.8) return false;
    if (!isClearOfLandmarks(cx, cz, 2.0)) return false;

    for (let i = 0; i < wallClusterCenters.length; i += 1) {
      if (Math.hypot(wallClusterCenters[i].x - cx, wallClusterCenters[i].z - cz) < 18.0) {
        return false;
      }
    }

    getTerrainNormal(cx, cz, normalScratch);
    const faceYaw = Math.atan2(normalScratch.x, normalScratch.z);
    // Tangent axis running sideways along the cliff face so overlapping slabs build a wide terraced wall
    const tanX = Math.cos(faceYaw);
    const tanZ = -Math.sin(faceYaw);
    const outX = Math.sin(faceYaw);
    const outZ = Math.cos(faceYaw);

    let placedInCluster = 0;
    for (let s = 0; s < targetSlabs; s += 1) {
      // Center slab is tallest monolith; flanking slabs step down into cascading terraces
      const offsetSlot = s - (targetSlabs - 1) * 0.5;
      const along = offsetSlot * (3.1 + wallRng() * 1.15);
      const forward = (Math.abs(offsetSlot) * 0.65) + (wallRng() - 0.5) * 1.3;
      const x = cx + tanX * along + outX * forward;
      const z = cz + tanZ * along + outZ * forward;

      if (Math.abs(x) > TERRAIN_HALF_SIZE - 14 || Math.abs(z) > TERRAIN_HALF_SIZE - 14) continue;
      if (getRiverSignedDistance(x, z) < 6.2) continue;
      if (getPathDistance(x, z) < 5.6) continue;
      if (!isClearOfLandmarks(x, z, 1.2)) continue;

      const groundY = getTerrainHeight(x, z);
      const localSlope = getTerrainSlope(x, z);
      const isCenterHero = Math.abs(offsetSlot) < 0.75;
      const sx = (isCenterHero ? 1.24 : 0.92) + wallRng() * 0.42;
      const sy = (isCenterHero ? 1.32 : 0.84) + wallRng() * 0.44;
      const sz = (isCenterHero ? 1.08 : 0.86) + wallRng() * 0.36;

      // Deep slope embed so towering terraced walls emerge seamlessly from the hillside with zero floating gaps
      const sink = 0.72 + localSlope * 1.85 + sy * 0.46;
      const y = groundY - sink;

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        (wallRng() - 0.5) * 0.08,
        faceYaw + (wallRng() - 0.5) * 0.52,
        (wallRng() - 0.5) * 0.08,
      );
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();

      const radius = Math.max(sx * 2.8, sz * 2.2);
      const height = sy * 3.1;

      cliffWallSlabs.push({
        matrix: dummy.matrix.clone(),
        color: stonePalette[Math.floor(wallRng() * stonePalette.length)],
        x,
        y,
        z,
        radius,
        height,
        kind: 'cliffWallSlab',
      });
      colliders.push({ x, y: groundY, z, radius: radius * 0.82, height, kind: 'cliffWallSlab' });
      placedInCluster += 1;
    }

    if (placedInCluster > 0) {
      wallClusterCenters.push({ x: cx, z: cz });
      return true;
    }
    return false;
  };

  for (const [hx, hz] of heroWallAnchors) {
    trySpawnWallCluster(hx, hz, 4);
  }

  for (let attempt = 0; attempt < 700 && wallClusterCenters.length < 16; attempt += 1) {
    const cx = (wallRng() - 0.5) * (TERRAIN_HALF_SIZE * 1.66);
    const cz = (wallRng() - 0.5) * (TERRAIN_HALF_SIZE * 1.66);
    const targetSlabs = 3 + (wallRng() > 0.5 ? 1 : 0);
    trySpawnWallCluster(cx, cz, targetSlabs);
  }

  // -------------------------------------------------------------------------
  // 2. Sculpted Cantilevered Cliff Outcrops along Hillside Ledges & Ruins Flanks
  // -------------------------------------------------------------------------
  const cliffRng = mulberry32(WORLD_SEED + 157);
  for (let attempt = 0; attempt < 950 && cliffOutcrops.length < 44; attempt += 1) {
    const x = (cliffRng() - 0.5) * (TERRAIN_HALF_SIZE * 1.68);
    const z = (cliffRng() - 0.5) * (TERRAIN_HALF_SIZE * 1.68);
    const slope = getTerrainSlope(x, z);
    if (slope < 0.28 || slope > 0.82) continue;
    if (getRiverSignedDistance(x, z) < 6.0) continue;
    if (getPathDistance(x, z) < 5.0) continue;
    if (!isClearOfLandmarks(x, z, 0.8)) continue;

    let tooClose = false;
    for (let j = 0; j < cliffOutcrops.length; j += 1) {
      const dx = cliffOutcrops[j].x - x;
      const dz = cliffOutcrops[j].z - z;
      if (dx * dx + dz * dz < 68) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const groundY = getTerrainHeight(x, z);
    getTerrainNormal(x, z, normalScratch);
    const sx = 0.85 + cliffRng() * 0.82;
    const sy = 0.72 + cliffRng() * 0.68;
    const sz = 0.8 + cliffRng() * 0.78;

    const sink = 0.45 + slope * 1.15 + sy * 0.35;
    const y = groundY - sink;

    dummy.position.set(x, y, z);
    dummy.rotation.set(
      (cliffRng() - 0.5) * 0.1,
      Math.atan2(normalScratch.x, normalScratch.z) + (cliffRng() - 0.5) * 0.75,
      (cliffRng() - 0.5) * 0.1,
    );
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();

    const radius = Math.max(sx * 2.4, sz * 2.0);
    const height = sy * 1.9;

    cliffOutcrops.push({
      matrix: dummy.matrix.clone(),
      color: stonePalette[Math.floor(cliffRng() * stonePalette.length)],
      x,
      y,
      z,
      radius,
      height,
      kind: 'cliffOutcrop',
    });
    colliders.push({ x, y: groundY, z, radius: radius * 0.82, height, kind: 'cliffOutcrop' });
  }

  // -------------------------------------------------------------------------
  // 3. High-Detail Chiseled Riverbank Boulders (Registering Water Foam Rings)
  // -------------------------------------------------------------------------
  const riverRng = mulberry32(WORLD_SEED + 211);
  const foamCandidates: Array<{ x: number; z: number; radius: number; distFromCenter: number }> = [];

  for (let attempt = 0; attempt < 950 && riverBoulders.length < 48; attempt += 1) {
    const x = (riverRng() - 0.5) * 200;
    const z = (riverRng() - 0.5) * 215;
    const riverDist = getRiverSignedDistance(x, z);
    if (riverDist < -1.25 || riverDist > 3.6) continue;
    if (getPathDistance(x, z) < 3.4) continue;
    if (getTerrainSlope(x, z) > 0.44) continue;
    if (!isClearOfLandmarks(x, z)) continue;
    // Keep stepping-stones crossing completely unobstructed
    if (Math.abs(z - 2.0) < 4.5 && riverDist < 2.2) continue;

    let tooClose = false;
    for (let j = 0; j < riverBoulders.length; j += 1) {
      const dx = riverBoulders[j].x - x;
      const dz = riverBoulders[j].z - z;
      if (dx * dx + dz * dz < 14) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const groundY = getTerrainHeight(x, z);
    const s = 0.68 + riverRng() * 0.85;
    const sx = s * (0.92 + riverRng() * 0.34);
    const sy = s * (0.76 + riverRng() * 0.32);
    const sz = s * (0.9 + riverRng() * 0.28);
    const sink = 0.3 + sy * 0.24;
    const y = groundY - sink;

    dummy.position.set(x, y, z);
    dummy.rotation.set(
      (riverRng() - 0.5) * 0.16,
      riverRng() * Math.PI * 2,
      (riverRng() - 0.5) * 0.16,
    );
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();

    const radius = Math.max(sx * 1.18, sz * 1.08);
    const height = sy * 0.9;

    riverBoulders.push({
      matrix: dummy.matrix.clone(),
      color: stonePalette[Math.floor(riverRng() * stonePalette.length)],
      x,
      y,
      z,
      radius,
      height,
      kind: 'riverBoulder',
    });

    if (radius >= 0.72) {
      colliders.push({ x, y: groundY, z, radius: radius * 0.88, height, kind: 'riverBoulder' });
    }

    if (riverDist < 1.1 && groundY < WATER_LEVEL + 0.35) {
      foamCandidates.push({
        x,
        z,
        radius: radius * 0.96,
        distFromCenter: Math.hypot(x - 2, z + 6),
      });
    }
  }

  // Register closest 22 foreground shoreline/submerged river boulders for analytical water foam rings
  if (water) {
    foamCandidates.sort((a, b) => a.distFromCenter - b.distFromCenter);
    const foamCount = Math.min(22, foamCandidates.length);
    for (let i = 0; i < foamCount; i += 1) {
      const f = foamCandidates[i];
      water.registerFoamObstacle(f.x, f.z, f.radius);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Clustered Chiseled Path-Edge Accent Stones Framing Trail Curves
  // -------------------------------------------------------------------------
  const pathRng = mulberry32(WORLD_SEED + 433);
  for (let attempt = 0; attempt < 3000 && pathStones.length < 66; attempt += 1) {
    const cx = (pathRng() - 0.5) * 130;
    const cz = (pathRng() - 0.5) * 120;
    const pathDist = getPathDistance(cx, cz);
    const riverDist = getRiverSignedDistance(cx, cz);
    const slope = getTerrainSlope(cx, cz);

    if (pathDist < 3.25 || pathDist > 5.4) continue;
    if (riverDist < 2.6) continue;
    if (slope > 0.36) continue;
    if (!isClearOfLandmarks(cx, cz, -0.5)) continue;

    let clusterTooClose = false;
    for (let j = 0; j < pathStones.length; j += 1) {
      const dx = pathStones[j].x - cx;
      const dz = pathStones[j].z - cz;
      if (dx * dx + dz * dz < 14) {
        clusterTooClose = true;
        break;
      }
    }
    if (clusterTooClose) continue;

    const clusterSize = 2 + (pathRng() > 0.55 ? 1 : 0);
    for (let k = 0; k < clusterSize && pathStones.length < 66; k += 1) {
      const angle = k * 2.2 + pathRng() * 0.9;
      const spread = k === 0 ? 0 : 0.65 + pathRng() * 0.55;
      const x = cx + Math.cos(angle) * spread;
      const z = cz + Math.sin(angle) * spread;

      if (
        getPathDistance(x, z) < 3.05 ||
        getRiverSignedDistance(x, z) < 2.2 ||
        !isClearOfLandmarks(x, z, -0.5)
      ) {
        continue;
      }

      const groundY = getTerrainHeight(x, z);
      const s = k === 0 ? 0.85 + pathRng() * 0.42 : 0.52 + pathRng() * 0.36;
      const sink = 0.25 + s * 0.14;
      const y = groundY - sink;

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        (pathRng() - 0.5) * 0.22,
        pathRng() * Math.PI * 2,
        (pathRng() - 0.5) * 0.22,
      );
      dummy.scale.set(
        s * (0.92 + pathRng() * 0.3),
        s * (0.78 + pathRng() * 0.32),
        s * (0.88 + pathRng() * 0.28),
      );
      dummy.updateMatrix();

      pathStones.push({
        matrix: dummy.matrix.clone(),
        color: stonePalette[Math.floor(pathRng() * stonePalette.length)],
        x,
        y,
        z,
        radius: s * 0.66,
        height: s * 0.48,
        kind: 'pathStone',
      });
    }
  }

  // Mount all 4 instanced high-detail archetypes + clean watertight #1e1633 plum-ink outlines
  createOutlinedInstancedRocks(
    'sculptedCliffWalls',
    cliffWallSlabGeo,
    grassCappedCliffMat,
    cliffWallSlabs,
    0.022,
    root,
  );
  createOutlinedInstancedRocks(
    'sculptedCliffOutcrops',
    cliffOutcropGeo,
    grassCappedCliffMat,
    cliffOutcrops,
    0.024,
    root,
  );
  createOutlinedInstancedRocks(
    'riverbankBoulders',
    riverBoulderGeo,
    chiseledStoneMat,
    riverBoulders,
    0.026,
    root,
  );
  createOutlinedInstancedRocks(
    'pathEdgeAccentStones',
    pathStoneGeo,
    chiseledStoneMat,
    pathStones,
    0.022,
    root,
  );

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
    colliders,
    stats: {
      cliffWallSlabs: cliffWallSlabs.length,
      cliffOutcrops: cliffOutcrops.length,
      riverBoulders: riverBoulders.length,
      pathStones: pathStones.length,
      totalRocks:
        cliffWallSlabs.length +
        cliffOutcrops.length +
        riverBoulders.length +
        pathStones.length,
      colliders: colliders.length,
    },
    dispose,
  };
}
