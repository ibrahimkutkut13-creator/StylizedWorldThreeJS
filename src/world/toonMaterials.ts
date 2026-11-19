import * as THREE from 'three';

export type ToonStepCount = 2 | 3;

export interface AnimeToonOptions {
  /** Number of cel-shading luminosity bands (default: 3). */
  steps?: ToonStepCount;
  /** Optional custom 0-255 luminance values per step (overrides default step table). */
  gradientStops?: readonly number[];
  /** Warm shadow tint color applied to shaded regions so shadows stay lively. */
  shadowTint?: THREE.ColorRepresentation;
  /** Blend strength of warm shadow tint in shaded regions (0..1, default: 0.38). */
  shadowTintStrength?: number;
  /** Fresnel rim highlight color (default: warm sunlight #fff5d6). */
  rimColor?: THREE.ColorRepresentation;
  /** Fresnel rim exponent; higher values tighten the highlight near silhouettes (default: 3.0). */
  rimPower?: number;
  /** Rim highlight intensity (default: 0.36). */
  rimIntensity?: number;
  /** Smoothness half-width of the stylized rim edge band (default: 0.16). */
  rimSmoothness?: number;
  /** Enable per-vertex colors (e.g. for stylized biome terrain). */
  vertexColors?: boolean;
  /** Material face culling mode (default: THREE.FrontSide). */
  side?: THREE.Side;
  /** Emissive color for glowing props (crystals, lanterns). */
  emissive?: THREE.ColorRepresentation;
  /** Emissive multiplier (default: 1). */
  emissiveIntensity?: number;
  /** Use flat faceted normals for chiseled low-poly rocks/cliffs. */
  flatShading?: boolean;
  /** Enable transparency if needed. */
  transparent?: boolean;
  /** Material opacity (default: 1). */
  opacity?: number;
  /** Whether the material responds to scene fog (default: true). */
  fog?: boolean;
  /** Optional texture map. */
  map?: THREE.Texture | null;
}

export interface AnimeToonUniforms {
  uShadowTint: { value: THREE.Color };
  uShadowTintStrength: { value: number };
  uRimColor: { value: THREE.Color };
  uRimPower: { value: number };
  uRimIntensity: { value: number };
  uRimSmoothness: { value: number };
}

export interface ResolvedAnimeToonOptions {
  steps: ToonStepCount;
  shadowTint: THREE.ColorRepresentation;
  shadowTintStrength: number;
  rimColor: THREE.ColorRepresentation;
  rimPower: number;
  rimIntensity: number;
  rimSmoothness: number;
  vertexColors: boolean;
  side: THREE.Side;
  emissive: THREE.ColorRepresentation;
  emissiveIntensity: number;
  flatShading: boolean;
  transparent: boolean;
  opacity: number;
  fog: boolean;
  map: THREE.Texture | null;
}

/**
 * Crisp nearest-filter luminance ramps mapped to `coord.x = dotNL * 0.5 + 0.5`.
 * - 3-step anime ramp (3 exact luminance levels quantized across 8 texels):
 *   dotNL < 0.0        -> deep shadow band (64)
 *   0.0 <= dotNL < 0.5 -> mid-tone band    (158)
 *   dotNL >= 0.5       -> sunlit highlight (255)
 * - 2-step cel ramp (2 exact luminance levels):
 *   dotNL < 0.0        -> shadow band      (72)
 *   dotNL >= 0.0       -> lit band         (255)
 */
export const DEFAULT_GRADIENT_STOPS: Record<ToonStepCount, readonly number[]> = {
  2: [72, 255],
  3: [64, 64, 64, 64, 158, 158, 255, 255],
};

export const DEFAULT_ANIME_TOON_OPTIONS: ResolvedAnimeToonOptions = {
  steps: 3,
  shadowTint: '#c97e68',
  shadowTintStrength: 0.44,
  rimColor: '#fff5d6',
  rimPower: 3.0,
  rimIntensity: 0.42,
  rimSmoothness: 0.14,
  vertexColors: false,
  side: THREE.FrontSide,
  emissive: '#000000',
  emissiveIntensity: 1,
  flatShading: false,
  transparent: false,
  opacity: 1,
  fog: true,
  map: null,
};

const gradientMapCache = new Map<string, THREE.DataTexture>();

export function resolveAnimeToonOptions(
  options: AnimeToonOptions = {},
): ResolvedAnimeToonOptions {
  return {
    steps: options.steps ?? DEFAULT_ANIME_TOON_OPTIONS.steps,
    shadowTint: options.shadowTint ?? DEFAULT_ANIME_TOON_OPTIONS.shadowTint,
    shadowTintStrength:
      options.shadowTintStrength ?? DEFAULT_ANIME_TOON_OPTIONS.shadowTintStrength,
    rimColor: options.rimColor ?? DEFAULT_ANIME_TOON_OPTIONS.rimColor,
    rimPower: options.rimPower ?? DEFAULT_ANIME_TOON_OPTIONS.rimPower,
    rimIntensity: options.rimIntensity ?? DEFAULT_ANIME_TOON_OPTIONS.rimIntensity,
    rimSmoothness:
      options.rimSmoothness ?? DEFAULT_ANIME_TOON_OPTIONS.rimSmoothness,
    vertexColors: options.vertexColors ?? DEFAULT_ANIME_TOON_OPTIONS.vertexColors,
    side: options.side ?? DEFAULT_ANIME_TOON_OPTIONS.side,
    emissive: options.emissive ?? DEFAULT_ANIME_TOON_OPTIONS.emissive,
    emissiveIntensity:
      options.emissiveIntensity ?? DEFAULT_ANIME_TOON_OPTIONS.emissiveIntensity,
    flatShading: options.flatShading ?? DEFAULT_ANIME_TOON_OPTIONS.flatShading,
    transparent: options.transparent ?? DEFAULT_ANIME_TOON_OPTIONS.transparent,
    opacity: options.opacity ?? DEFAULT_ANIME_TOON_OPTIONS.opacity,
    fog: options.fog ?? DEFAULT_ANIME_TOON_OPTIONS.fog,
    map: options.map ?? DEFAULT_ANIME_TOON_OPTIONS.map,
  };
}

/**
 * Generates an RGBA Uint8Array for a crisp 1D cel-shading ramp.
 * Uses 4-byte RGBA texels to avoid WebGL UNPACK_ALIGNMENT edge cases
 * while Three.js MeshToonMaterial samples the `.r` channel cleanly.
 */
export function buildToonGradientData(
  steps: ToonStepCount = 3,
  customStops?: readonly number[],
): { data: Uint8Array; width: number; distinctLevels: number } {
  const stops =
    customStops && customStops.length >= 2
      ? customStops
      : DEFAULT_GRADIENT_STOPS[steps];
  const width = stops.length;
  const data = new Uint8Array(width * 4);
  const uniqueLevels = new Set<number>();

  for (let i = 0; i < width; i += 1) {
    const v = Math.max(0, Math.min(255, Math.round(stops[i])));
    uniqueLevels.add(v);
    const offset = i * 4;
    data[offset] = v;
    data[offset + 1] = v;
    data[offset + 2] = v;
    data[offset + 3] = 255;
  }

  return { data, width, distinctLevels: uniqueLevels.size };
}

/**
 * Returns a cached nearest-filter DataTexture gradient map for MeshToonMaterial.
 */
export function getToonGradientMap(
  steps: ToonStepCount = 3,
  customStops?: readonly number[],
): THREE.DataTexture {
  const stops =
    customStops && customStops.length >= 2
      ? customStops
      : DEFAULT_GRADIENT_STOPS[steps];
  const cacheKey = stops.map((s) => Math.round(s)).join(',');

  const cached = gradientMapCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { data, width } = buildToonGradientData(steps, stops);
  const texture = new THREE.DataTexture(
    data,
    width,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  gradientMapCache.set(cacheKey, texture);
  return texture;
}

/**
 * Disposes all cached gradient DataTextures (call during full engine teardown).
 */
export function disposeToonGradientMaps(): void {
  gradientMapCache.forEach((tex) => tex.dispose());
  gradientMapCache.clear();
}

const ANIME_DIR_SHADOW_NEEDLE =
  'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

const ANIME_DIR_SHADOW_REPLACEMENT = /* glsl */ `
  animeCurrentShadow = 1.0;
  if ( directLight.visible && receiveShadow ) {
    float animeRawShadow = getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] );
    // Preserve smooth anti-aliased VSM shadow penumbra; guard back faces from self-shadow acne.
    float animeFrontMask = smoothstep( 0.04, 0.16, dot( geometryNormal, directLight.direction ) );
    animeCurrentShadow = mix( 1.0, animeRawShadow, animeFrontMask );
  }
`;

const ANIME_RE_DIRECT_NEEDLE =
  'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';

const ANIME_RE_DIRECT_REPLACEMENT = /* glsl */ `
  vec3 animeLitIrradiance = getGradientIrradiance( geometryNormal, directLight.direction );
  vec3 animeShadowFloor = getGradientIrradiance( -directLight.direction, directLight.direction );
  vec3 irradiance = mix( min( animeLitIrradiance, animeShadowFloor ), animeLitIrradiance, animeCurrentShadow ) * directLight.color;
  animeCurrentShadow = 1.0;
`;

function buildAnimeLightsToonParsChunk(): string {
  const base = THREE.ShaderChunk.lights_toon_pars_fragment;
  const patched = base.replace(ANIME_RE_DIRECT_NEEDLE, ANIME_RE_DIRECT_REPLACEMENT);
  return /* glsl */ `
float animeCurrentShadow;
${patched}
uniform vec3 uShadowTint;
uniform float uShadowTintStrength;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uRimSmoothness;
`;
}

function buildAnimeLightsFragmentBeginChunk(): string {
  const base = THREE.ShaderChunk.lights_fragment_begin;
  const patched = base.replace(ANIME_DIR_SHADOW_NEEDLE, ANIME_DIR_SHADOW_REPLACEMENT);
  return `animeCurrentShadow = 1.0;\n${patched}`;
}

const ANIME_TOON_FRAGMENT_EFFECT = /* glsl */ `
{
  float animeBaseLuma = max( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
  float animeDirectLuma = dot( reflectedLight.directDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) );
  float animeLitRatio = clamp( ( animeDirectLuma * PI ) / animeBaseLuma, 0.0, 1.0 );

  // Warm shadow tint in shaded cel bands and cast shadows so shade stays vibrant and warm.
  float animeShadowMask = 1.0 - smoothstep( 0.34, 0.68, animeLitRatio );
  vec3 animeWarmTarget = outgoingLight * mix( vec3( 1.0 ), uShadowTint * 1.38, 0.65 )
    + diffuseColor.rgb * uShadowTint * 0.16;
  outgoingLight = mix( outgoingLight, animeWarmTarget, animeShadowMask * uShadowTintStrength );

  // Subtle stylized Fresnel rim highlight hugging sunlit silhouettes without washing out shadows.
  vec3 animeViewDir = normalize( vViewPosition );
  float animeNdotV = clamp( dot( normalize( normal ), animeViewDir ), 0.0, 1.0 );
  float animeRimRaw = pow( 1.0 - animeNdotV, uRimPower );
  float animeRimEdge = 0.42;
  float animeRimHalf = max( uRimSmoothness, 0.01 );
  float animeRimBand = smoothstep( animeRimEdge - animeRimHalf, animeRimEdge + animeRimHalf, animeRimRaw );
  float animeRimMask = mix( 0.14, 1.0, smoothstep( 0.30, 0.82, animeLitRatio ) );
  outgoingLight += uRimColor * ( animeRimBand * uRimIntensity * animeRimMask );
}
#include <opaque_fragment>
`;

/**
 * Creates a reusable anime cel-shaded MeshToonMaterial with:
 * - Crisp nearest-filter 3-step (or 2-step) DataTexture gradient map
 * - Cel-quantized cast shadows with zero back-face self-shadow acne
 * - Warm shadow tinting in shaded/occluded regions
 * - Subtle grazing-angle Fresnel rim highlight
 */
export function createAnimeToonMaterial(
  hexColor: THREE.ColorRepresentation,
  options: AnimeToonOptions = {},
): THREE.MeshToonMaterial {
  const resolved = resolveAnimeToonOptions(options);
  const gradientMap = getToonGradientMap(resolved.steps, options.gradientStops);

  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(hexColor),
    gradientMap,
    vertexColors: resolved.vertexColors,
    side: resolved.side,
    emissive: new THREE.Color(resolved.emissive),
    emissiveIntensity: resolved.emissiveIntensity,
    transparent: resolved.transparent,
    opacity: resolved.opacity,
    fog: resolved.fog,
    map: resolved.map,
  });

  // flatShading is supported by MeshToonMaterial shader chunks via defines.
  if (resolved.flatShading) {
    (material as THREE.MeshToonMaterial & { flatShading?: boolean }).flatShading =
      true;
  }

  const uniforms: AnimeToonUniforms = {
    uShadowTint: { value: new THREE.Color(resolved.shadowTint) },
    uShadowTintStrength: { value: resolved.shadowTintStrength },
    uRimColor: { value: new THREE.Color(resolved.rimColor) },
    uRimPower: { value: resolved.rimPower },
    uRimIntensity: { value: resolved.rimIntensity },
    uRimSmoothness: { value: resolved.rimSmoothness },
  };

  material.userData.animeToonUniforms = uniforms;
  material.userData.animeToonSteps = resolved.steps;

  material.customProgramCacheKey = () =>
    resolved.flatShading ? 'anime-toon-v2-flat' : 'anime-toon-v2';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = uniforms.uShadowTint;
    shader.uniforms.uShadowTintStrength = uniforms.uShadowTintStrength;
    shader.uniforms.uRimColor = uniforms.uRimColor;
    shader.uniforms.uRimPower = uniforms.uRimPower;
    shader.uniforms.uRimIntensity = uniforms.uRimIntensity;
    shader.uniforms.uRimSmoothness = uniforms.uRimSmoothness;

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_toon_pars_fragment>', buildAnimeLightsToonParsChunk())
      .replace('#include <lights_fragment_begin>', buildAnimeLightsFragmentBeginChunk())
      .replace('#include <opaque_fragment>', ANIME_TOON_FRAGMENT_EFFECT);

    material.userData.shader = shader;
  };

  return material;
}

/**
 * Updates live warm-shadow and rim uniforms on an anime toon material without recompiling shaders.
 */
export function updateAnimeToonMaterial(
  material: THREE.MeshToonMaterial,
  updates: Partial<
    Pick<
      AnimeToonOptions,
      | 'shadowTint'
      | 'shadowTintStrength'
      | 'rimColor'
      | 'rimPower'
      | 'rimIntensity'
      | 'rimSmoothness'
    >
  >,
): void {
  const uniforms = material.userData.animeToonUniforms as
    | AnimeToonUniforms
    | undefined;
  if (!uniforms) return;

  if (updates.shadowTint !== undefined) {
    uniforms.uShadowTint.value.set(updates.shadowTint);
  }
  if (updates.shadowTintStrength !== undefined) {
    uniforms.uShadowTintStrength.value = updates.shadowTintStrength;
  }
  if (updates.rimColor !== undefined) {
    uniforms.uRimColor.value.set(updates.rimColor);
  }
  if (updates.rimPower !== undefined) {
    uniforms.uRimPower.value = updates.rimPower;
  }
  if (updates.rimIntensity !== undefined) {
    uniforms.uRimIntensity.value = updates.rimIntensity;
  }
  if (updates.rimSmoothness !== undefined) {
    uniforms.uRimSmoothness.value = updates.rimSmoothness;
  }
}

// ---------------------------------------------------------------------------
// Task 03: Inverted-Hull Ink Outline System
// ---------------------------------------------------------------------------

export const DEFAULT_OUTLINE_THICKNESS = 0.035;
export const DEFAULT_OUTLINE_COLOR = '#1e1633';

export interface InkOutlineOptions {
  thickness?: number;
  color?: THREE.ColorRepresentation;
  distanceScaling?: boolean;
}

const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {};

const INK_OUTLINE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec3 aSmoothNormal;

uniform float uOutlineThickness;
uniform float uUseSmoothNormal;
uniform float uDistanceScale;

void main() {
  vec3 smoothDir = length( aSmoothNormal ) > 0.0001 ? normalize( aSmoothNormal ) : normalize( normal );
  vec3 extrudeDir = normalize( mix( normal, smoothDir, uUseSmoothNormal ) );

  vec4 baseMvPosition = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    baseMvPosition = instanceMatrix * baseMvPosition;
  #endif
  baseMvPosition = modelViewMatrix * baseMvPosition;

  float viewDist = max( -baseMvPosition.z, 0.5 );
  float adaptiveScale = mix( 1.0, clamp( pow( viewDist / 10.0, 0.42 ), 0.62, 2.0 ), uDistanceScale );
  vec3 extruded = position + extrudeDir * ( uOutlineThickness * adaptiveScale );

  vec4 mvPosition = vec4( extruded, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;

  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const INK_OUTLINE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uOutlineColor;

void main() {
  gl_FragColor = vec4( uOutlineColor, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/**
 * Computes angle-weighted smoothed normals averaged across vertices sharing identical
 * 3D positions so inverted-hull outlines stay completely watertight on hard-edged /
 * flat-shaded low-poly meshes (boxes, beveled boulders, pillars) without modifying
 * the geometry's primary `normal` attribute.
 */
export function computeSmoothNormalsAttribute(
  geometry: THREE.BufferGeometry,
): THREE.BufferAttribute {
  const existing = geometry.getAttribute('aSmoothNormal');
  if (existing instanceof THREE.BufferAttribute) {
    return existing;
  }

  const posAttr = geometry.getAttribute('position');
  if (!posAttr) {
    const empty = new THREE.BufferAttribute(new Float32Array(0), 3);
    geometry.setAttribute('aSmoothNormal', empty);
    return empty;
  }

  const vertexCount = posAttr.count;
  const accumMap = new Map<string, [number, number, number]>();
  const vertexKeys = new Array<string>(vertexCount);

  for (let i = 0; i < vertexCount; i += 1) {
    const kx = Math.round(posAttr.getX(i) * 1e4);
    const ky = Math.round(posAttr.getY(i) * 1e4);
    const kz = Math.round(posAttr.getZ(i) * 1e4);
    const key = `${kx},${ky},${kz}`;
    vertexKeys[i] = key;
    if (!accumMap.has(key)) {
      accumMap.set(key, [0, 0, 0]);
    }
  }

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const e3 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  const index = geometry.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(vertexCount / 3);

  const addCornerNormal = (vertIdx: number, weight: number) => {
    const acc = accumMap.get(vertexKeys[vertIdx]);
    if (!acc) return;
    acc[0] += faceNormal.x * weight;
    acc[1] += faceNormal.y * weight;
    acc[2] += faceNormal.z * weight;
  };

  for (let t = 0; t < triCount; t += 1) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    p0.fromBufferAttribute(posAttr, i0);
    p1.fromBufferAttribute(posAttr, i1);
    p2.fromBufferAttribute(posAttr, i2);

    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    faceNormal.crossVectors(e1, e2);

    const areaSq = faceNormal.lengthSq();
    if (areaSq < 1e-14) continue;
    faceNormal.multiplyScalar(1 / Math.sqrt(areaSq));

    // Angle-weighted contribution ensures split quads (e.g. BoxGeometry) don't skew corner normals.
    const len01 = e1.length();
    const len02 = e2.length();
    e3.subVectors(p2, p1);
    const len12 = e3.length();

    if (len01 > 1e-8 && len02 > 1e-8 && len12 > 1e-8) {
      const w0 = Math.acos(
        THREE.MathUtils.clamp(e1.dot(e2) / (len01 * len02), -1, 1),
      );
      const w1 = Math.acos(
        THREE.MathUtils.clamp(-e1.dot(e3) / (len01 * len12), -1, 1),
      );
      const w2 = Math.max(0, Math.PI - w0 - w1);

      addCornerNormal(i0, w0);
      addCornerNormal(i1, w1);
      addCornerNormal(i2, w2);
    }
  }

  const normalAttr = geometry.getAttribute('normal');
  const smoothArray = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i += 1) {
    const acc = accumMap.get(vertexKeys[i]);
    let nx = acc ? acc[0] : 0;
    let ny = acc ? acc[1] : 0;
    let nz = acc ? acc[2] : 0;
    const len = Math.hypot(nx, ny, nz);

    if (len > 1e-6) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else if (normalAttr) {
      nx = normalAttr.getX(i);
      ny = normalAttr.getY(i);
      nz = normalAttr.getZ(i);
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }

    smoothArray[i * 3] = nx;
    smoothArray[i * 3 + 1] = ny;
    smoothArray[i * 3 + 2] = nz;
  }

  const smoothAttr = new THREE.BufferAttribute(smoothArray, 3);
  geometry.setAttribute('aSmoothNormal', smoothAttr);
  return smoothAttr;
}

/**
 * Creates a fog-aware BackSide ShaderMaterial for inverted-hull anime outlines.
 */
export function createInkOutlineMaterial(
  thickness: number = DEFAULT_OUTLINE_THICKNESS,
  color: THREE.ColorRepresentation = DEFAULT_OUTLINE_COLOR,
  distanceScaling = true,
): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uOutlineThickness: { value: thickness },
      uOutlineColor: { value: new THREE.Color(color) },
      uUseSmoothNormal: { value: 1.0 },
      uDistanceScale: { value: distanceScaling ? 1.0 : 0.0 },
    },
  ]);

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: INK_OUTLINE_VERTEX_SHADER,
    fragmentShader: INK_OUTLINE_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: true,
    fog: true,
  });
}

/**
 * Attaches an inverted-hull anime ink outline as a child of `mesh` using deep plum-ink
 * (`#1e1633` by default) extruded along smoothed vertex normals.
 * Calling again on an already-outlined mesh updates its thickness/color cleanly.
 */
export function addInkOutline(
  mesh: THREE.Mesh,
  thickness: number = DEFAULT_OUTLINE_THICKNESS,
  color: THREE.ColorRepresentation = DEFAULT_OUTLINE_COLOR,
): THREE.Mesh {
  const existing = mesh.children.find(
    (child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.userData.isInkOutline === true,
  );

  if (existing && existing.material instanceof THREE.ShaderMaterial) {
    existing.material.uniforms.uOutlineThickness.value = thickness;
    existing.material.uniforms.uOutlineColor.value.set(color);
    existing.castShadow = false;
    existing.receiveShadow = false;
    return existing;
  }

  computeSmoothNormalsAttribute(mesh.geometry);
  const outlineMat = createInkOutlineMaterial(thickness, color);
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);

  outlineMesh.name = `${mesh.name || 'mesh'}_inkOutline`;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  outlineMesh.raycast = NOOP_RAYCAST;
  outlineMesh.userData.isInkOutline = true;

  mesh.add(outlineMesh);
  return outlineMesh;
}

function shouldSkipOutlineMaterial(material: THREE.Material | THREE.Material[]): boolean {
  const mats = Array.isArray(material) ? material : [material];
  return mats.some((mat) => {
    if (mat.transparent && mat.opacity < 0.85) return true;
    const emissiveMat = mat as THREE.Material & {
      emissive?: THREE.Color;
      emissiveIntensity?: number;
    };
    if (
      emissiveMat.emissive &&
      emissiveMat.emissiveIntensity !== undefined &&
      emissiveMat.emissiveIntensity > 1.0 &&
      emissiveMat.emissive.r + emissiveMat.emissive.g + emissiveMat.emissive.b > 0.05
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Applies deep plum-ink inverted-hull outlines to all qualifying meshes inside a group,
 * automatically skipping emissive cores, transparent elements, and already-outlined meshes.
 */
export function addInkOutlineToGroup(
  group: THREE.Object3D,
  thickness: number = DEFAULT_OUTLINE_THICKNESS,
  color: THREE.ColorRepresentation = DEFAULT_OUTLINE_COLOR,
): THREE.Mesh[] {
  const targets: THREE.Mesh[] = [];

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.isInkOutline || obj.userData.skipInkOutline) return;
    if (shouldSkipOutlineMaterial(obj.material)) return;
    targets.push(obj);
  });

  return targets.map((mesh) => addInkOutline(mesh, thickness, color));
}
