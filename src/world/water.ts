import * as THREE from 'three';
import {
  TERRAIN_SIZE,
  WATER_LEVEL,
  getTerrainHeight as defaultGetTerrainHeight,
} from './terrain';

/**
 * Canonical Task 08 cel-shaded anime water palette (sRGB hex).
 */
export const WATER_COLORS = {
  shallow: '#6be0ff',
  base: '#38b6ff',
  deep: '#1f8ad8',
  foam: '#f4fdff',
  sparkle: '#fff9dc',
} as const;

export interface FoamObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface WaterTerrainData {
  getTerrainHeight?: (x: number, z: number) => number;
  waterLevel?: number;
  sunDirection?: THREE.Vector3;
}

export interface WaterController {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly material: THREE.ShaderMaterial;
  readonly obstacles: readonly FoamObstacle[];
  update: (dt: number, elapsed: number) => void;
  setSunDirection: (dir: THREE.Vector3) => void;
  setMoodTint: (
    baseHex: THREE.ColorRepresentation,
    deepHex: THREE.ColorRepresentation,
    sparkleHex?: THREE.ColorRepresentation,
    shallowHex?: THREE.ColorRepresentation,
  ) => void;
  registerFoamObstacle: (x: number, z: number, radius: number) => void;
  dispose: () => void;
}

const WATER_WIDTH = 136;
const WATER_LENGTH = TERRAIN_SIZE;
const WATER_SEG_X = 160;
const WATER_SEG_Z = 256;
const MAX_SHADER_OBSTACLES = 32;

const WATER_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute float aDepth;
attribute float aShoreFactor;
attribute float aObstacleDist;

uniform float uTime;

varying float vDepth;
varying float vShoreFactor;
varying float vObstacleDist;
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vDepth = aDepth;
  vShoreFactor = aShoreFactor;
  vObstacleDist = aObstacleDist;
  vUv = uv;

  vec3 pos = position;
  vec4 worldPosition = modelMatrix * vec4( pos, 1.0 );

  // Gentle vertical wave swell strictly in open water so shorelines stay anchored to sand
  float waveMask = smoothstep( 0.08, 0.72, aDepth );
  float wave = sin( worldPosition.z * 0.42 - uTime * 2.0 + worldPosition.x * 0.22 ) * 0.028
             + cos( worldPosition.x * 0.58 + uTime * 1.5 - worldPosition.z * 0.18 ) * 0.018;
  pos.y += wave * waveMask;

  worldPosition = modelMatrix * vec4( pos, 1.0 );
  vWorldPos = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform float uTime;
uniform vec3 uShallowColor;
uniform vec3 uBaseColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
uniform vec3 uSparkleColor;
uniform vec3 uSunDirection;
uniform int uObstacleCount;
uniform vec4 uObstacles[${MAX_SHADER_OBSTACLES}];

varying float vDepth;
varying float vShoreFactor;
varying float vObstacleDist;
varying vec3 vWorldPos;
varying vec2 vUv;

vec2 hash22( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}

float hash21( vec2 p ) {
  p = fract( p * vec2( 234.34, 435.345 ) );
  p += dot( p, p + 34.23 );
  return fract( p.x * p.y );
}

float valueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

// 2D cellular Voronoi returning distance to nearest moving cell center (for anime caustics & foam)
float voronoi2D( vec2 p, float phase ) {
  vec2 n = floor( p );
  vec2 f = fract( p );
  float minDist = 1.0;
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = vec2( float( i ), float( j ) );
      vec2 rnd = hash22( n + g );
      vec2 o = 0.5 + 0.42 * sin( phase + 6.2831 * rnd );
      vec2 r = g + o - f;
      float d = dot( r, r );
      if ( d < minDist ) {
        minDist = d;
      }
    }
  }
  return sqrt( minDist );
}

// Crisp cel-shaded step with subtle anti-aliased feather to prevent jagged stair-stepping
float toonStep( float edge, float value ) {
  return smoothstep( edge - 0.03, edge + 0.03, value );
}

void main() {
  // Trim dry riverbanks cleanly so water never Z-fights or pokes through land
  if ( vDepth < -0.015 ) discard;

  float shoreDepth = max( vDepth, 0.0 );

  // Downstream flow coordinates aligned gently with the sinuous river axis
  float riverBend = 13.5 * sin( ( vWorldPos.z - 18.0 ) * 0.028 )
                  + 4.5 * sin( ( vWorldPos.z - 18.0 ) * 0.013 );
  float localAcross = vWorldPos.x - riverBend;

  vec2 flowUv1 = vec2( localAcross * 0.21, vWorldPos.z * 0.19 - uTime * 0.42 );
  vec2 flowUv2 = vec2( localAcross * 0.34 + uTime * 0.08, vWorldPos.z * 0.31 - uTime * 0.64 );

  float n1 = valueNoise( flowUv1 );
  float n2 = valueNoise( flowUv2 );
  float ripple = n1 * 0.58 + n2 * 0.42;

  // Dual-layer Voronoi cellular caustic web (brightest in sunlit shallows & mid-water)
  float vCellA = voronoi2D( vec2( localAcross * 0.24, vWorldPos.z * 0.22 - uTime * 0.32 ), uTime * 0.9 );
  float vCellB = voronoi2D( vec2( localAcross * 0.36 + 2.7, vWorldPos.z * 0.33 - uTime * 0.48 ), uTime * 1.15 );
  float causticRidge = smoothstep( 0.56, 0.78, vCellA ) * 0.65 + smoothstep( 0.60, 0.82, vCellB ) * 0.5;
  float causticBand = toonStep( 0.58, causticRidge ) * smoothstep( 1.95, 0.25, shoreDepth ) * smoothstep( 0.06, 0.28, shoreDepth );

  // Stylized 3-band anime depth palette: shallow #6be0ff -> base #38b6ff -> deep #1f8ad8
  float dPerturbed = shoreDepth + ( ripple - 0.5 ) * 0.14;
  float midBand = smoothstep( 0.22, 0.52, dPerturbed );
  float deepBand = smoothstep( 1.05, 1.52, dPerturbed );
  vec3 waterCol = mix( uShallowColor, uBaseColor, midBand );
  waterCol = mix( waterCol, uDeepColor, deepBand );

  // Layer crisp stylized caustic highlight web in shallows
  waterCol = mix( waterCol, mix( uShallowColor, uFoamColor, 0.55 ), causticBand * 0.38 );

  // Sleek downstream cel-shaded current streaks aligned along the river centerline
  float streakSample = valueNoise( vec2( localAcross * 0.88 + ( n1 - 0.5 ) * 0.55, vWorldPos.z * 0.085 - uTime * 0.78 ) );
  float streakMask = toonStep( 0.73, streakSample ) * smoothstep( 0.28, 0.72, shoreDepth );
  waterCol = mix( waterCol, mix( uShallowColor, uFoamColor, 0.45 ), streakMask * 0.42 );

  // Exact analytical distance to registered foam obstacles (stepping-stones, boulders, piers)
  float obsDist = vObstacleDist;
  for ( int i = 0; i < ${MAX_SHADER_OBSTACLES}; i++ ) {
    if ( i >= uObstacleCount ) break;
    vec4 obs = uObstacles[i];
    float d = length( vWorldPos.xz - obs.xy ) - obs.z;
    obsDist = min( obsDist, d );
  }

  // Crisp quantized anime shoreline foam ribbons (aDepth < 0.55)
  float foamNoise = ( vCellA - 0.5 ) * 0.14 + ( ripple - 0.5 ) * 0.09;
  float shoreEdgeFoam = smoothstep( 0.21, 0.12, shoreDepth + foamNoise );
  float shoreWave = sin( shoreDepth * 16.5 - uTime * 3.2 + vCellA * 3.6 );
  float shoreRippleRibbon =
    step( shoreDepth, 0.55 ) *
    smoothstep( 0.55, 0.40, shoreDepth ) *
    toonStep( 0.44, shoreWave );

  // Smooth circular animated white foam rings wrapping stepping-stones, boulders & bridge piers
  float obsWave = sin( obsDist * 10.5 - uTime * 3.6 + n2 * 2.8 );
  float obsContact = toonStep( 0.5, 1.0 - smoothstep( 0.04, 0.34, obsDist + foamNoise * 1.1 ) );
  float obsRipple =
    step( obsDist, 1.15 ) *
    smoothstep( 1.15, 0.38, obsDist ) *
    toonStep( 0.54, obsWave );

  float foamMask = clamp(
    max( max( shoreEdgeFoam, shoreRippleRibbon * 0.92 ), max( obsContact, obsRipple * 0.88 ) ),
    0.0,
    1.0
  );
  waterCol = mix( waterCol, uFoamColor, foamMask * 0.96 );

  // Shimmering step-thresholded specular sun sparkles aligned to uSunDirection
  vec3 viewDir = normalize( cameraPosition - vWorldPos );
  vec3 sunDir = normalize( uSunDirection );
  vec3 pertNormal = normalize( vec3(
    ( n1 - 0.5 ) * 0.32 + ( vCellB - 0.5 ) * 0.22,
    1.0,
    ( n2 - 0.5 ) * 0.32 + ( vCellA - 0.5 ) * 0.22
  ) );
  vec3 halfVec = normalize( sunDir + viewDir );
  float specBroad = pow( max( dot( pertNormal, halfVec ), 0.0 ), 14.0 );
  float specTight = pow( max( dot( pertNormal, halfVec ), 0.0 ), 48.0 );

  float glintA = valueNoise( vWorldPos.xz * 1.45 + vec2( uTime * 0.55, -uTime * 0.82 ) );
  float glintB = valueNoise( vWorldPos.xz * 2.35 + vec2( -uTime * 0.65, -uTime * 1.15 ) );
  float glintField = glintA * glintB;

  // Star-like cel-thresholded glints + sun-path sheen (HDR peak > 1.15 triggers soft bloom)
  float sparkleStar = toonStep( 0.46, glintField * ( 0.58 + specBroad * 1.15 ) ) * smoothstep( 0.14, 0.42, shoreDepth );
  float sunGlintCore = toonStep( 0.58, specTight * ( 0.72 + glintA * 0.75 ) );
  float totalSparkle = clamp( max( sparkleStar * 0.85, sunGlintCore ), 0.0, 1.0 ) * ( 1.0 - foamMask * 0.75 );
  waterCol += uSparkleColor * totalSparkle * 1.32;

  // Delicate sky Fresnel bounce at low grazing angles
  float fresnel = pow( 1.0 - clamp( dot( pertNormal, viewDir ), 0.0, 1.0 ), 3.2 );
  waterCol = mix( waterCol, uFoamColor * 0.94, fresnel * 0.22 );

  // Stylized opacity gradient: 0.78 in translucent shallows -> 0.94 in deep pond
  float alpha = mix( 0.78, 0.94, smoothstep( 0.0, 1.15, shoreDepth ) );
  alpha = mix( alpha, 0.97, foamMask );
  alpha *= smoothstep( -0.015, 0.045, vDepth );

  gl_FragColor = vec4( waterCol, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function deriveShallowTint(baseColor: THREE.Color, target = new THREE.Color()): THREE.Color {
  // Lift base hue gently toward airy turquoise-white so mood presets stay cohesive
  return target.copy(baseColor).lerp(new THREE.Color('#c8f7ff'), 0.34);
}

/**
 * Creates the stylized cel-shaded anime river & tranquil pond surface at `WATER_LEVEL`.
 * Accepts either a `THREE.Vector3` sun direction or a `WaterTerrainData` options object.
 */
export function createWater(
  scene: THREE.Scene,
  terrainOrSun?: THREE.Vector3 | WaterTerrainData,
): WaterController {
  const isSunVec = terrainOrSun instanceof THREE.Vector3;
  const sunDirection = isSunVec
    ? terrainOrSun
    : (terrainOrSun?.sunDirection ?? new THREE.Vector3(0.6, 0.7, 0.4));
  const queryHeight = isSunVec
    ? defaultGetTerrainHeight
    : (terrainOrSun?.getTerrainHeight ?? defaultGetTerrainHeight);
  const waterLevel = isSunVec
    ? WATER_LEVEL
    : (terrainOrSun?.waterLevel ?? WATER_LEVEL);

  const geometry = new THREE.PlaneGeometry(
    WATER_WIDTH,
    WATER_LENGTH,
    WATER_SEG_X,
    WATER_SEG_Z,
  );
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position;
  const vertexCount = posAttr.count;
  const depths = new Float32Array(vertexCount);
  const shoreFactors = new Float32Array(vertexCount);
  const obstacleDists = new Float32Array(vertexCount);
  obstacleDists.fill(99);

  for (let i = 0; i < vertexCount; i += 1) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);
    const groundY = queryHeight(wx, wz);
    const depth = waterLevel - groundY;
    depths[i] = depth;
    shoreFactors[i] = depth <= 0 ? 0 : Math.max(0, Math.min(1, 1 - depth / 0.55));
  }

  geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
  geometry.setAttribute('aShoreFactor', new THREE.BufferAttribute(shoreFactors, 1));
  const obstacleAttr = new THREE.BufferAttribute(obstacleDists, 1);
  geometry.setAttribute('aObstacleDist', obstacleAttr);

  const obstacleUniformArray: THREE.Vector4[] = Array.from(
    { length: MAX_SHADER_OBSTACLES },
    () => new THREE.Vector4(0, 0, 0, 0),
  );

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShallowColor: { value: new THREE.Color(WATER_COLORS.shallow) },
      uBaseColor: { value: new THREE.Color(WATER_COLORS.base) },
      uDeepColor: { value: new THREE.Color(WATER_COLORS.deep) },
      uFoamColor: { value: new THREE.Color(WATER_COLORS.foam) },
      uSparkleColor: { value: new THREE.Color(WATER_COLORS.sparkle) },
      uSunDirection: { value: sunDirection.clone().normalize() },
      uObstacleCount: { value: 0 },
      uObstacles: { value: obstacleUniformArray },
    },
  ]);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    fog: true,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'valleyRiverWater';
  mesh.position.set(0, waterLevel, 0);
  mesh.renderOrder = 2;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  scene.add(mesh);

  const obstacles: FoamObstacle[] = [];

  const registerFoamObstacle = (x: number, z: number, radius: number): void => {
    const safeR = Math.max(0.2, radius);
    obstacles.push({ x, z, radius: safeR });

    const shaderIdx = uniforms.uObstacleCount.value as number;
    if (shaderIdx < MAX_SHADER_OBSTACLES) {
      const targetVec = (uniforms.uObstacles.value as THREE.Vector4[])[shaderIdx];
      targetVec.set(x, z, safeR, 1);
      uniforms.uObstacleCount.value = shaderIdx + 1;
    }

    const maxCheck = safeR + 3.8;
    for (let i = 0; i < vertexCount; i += 1) {
      const wx = posAttr.getX(i);
      if (Math.abs(wx - x) > maxCheck) continue;
      const wz = posAttr.getZ(i);
      if (Math.abs(wz - z) > maxCheck) continue;
      const dist = Math.hypot(wx - x, wz - z) - safeR;
      if (dist < obstacleDists[i]) {
        obstacleDists[i] = dist;
      }
    }
    obstacleAttr.needsUpdate = true;
  };

  const setSunDirection = (dir: THREE.Vector3): void => {
    if (dir.lengthSq() > 1e-8) {
      uniforms.uSunDirection.value.copy(dir).normalize();
    }
  };

  const setMoodTint = (
    baseHex: THREE.ColorRepresentation,
    deepHex: THREE.ColorRepresentation,
    sparkleHex?: THREE.ColorRepresentation,
    shallowHex?: THREE.ColorRepresentation,
  ): void => {
    uniforms.uBaseColor.value.set(baseHex);
    uniforms.uDeepColor.value.set(deepHex);
    if (sparkleHex !== undefined) {
      uniforms.uSparkleColor.value.set(sparkleHex);
    }
    if (shallowHex !== undefined) {
      uniforms.uShallowColor.value.set(shallowHex);
    } else {
      deriveShallowTint(uniforms.uBaseColor.value, uniforms.uShallowColor.value);
    }
  };

  const update = (_dt: number, elapsed: number): void => {
    uniforms.uTime.value = elapsed;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return {
    mesh,
    material,
    obstacles,
    update,
    setSunDirection,
    setMoodTint,
    registerFoamObstacle,
    dispose,
  };
}
