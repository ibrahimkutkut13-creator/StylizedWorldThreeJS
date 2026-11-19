import * as THREE from 'three';

export interface AtmosphereConfig {
  zenithColor: THREE.ColorRepresentation;
  midSkyColor: THREE.ColorRepresentation;
  horizonColor: THREE.ColorRepresentation;
  groundColor: THREE.ColorRepresentation;
  fogColor: THREE.ColorRepresentation;
  fogDensity: number;
  sunPosition: readonly [number, number, number];
  sunColor: THREE.ColorRepresentation;
  sunIntensity: number;
  sunGlowColor: THREE.ColorRepresentation;
  sunGlowIntensity: number;
  hemiSkyColor: THREE.ColorRepresentation;
  hemiGroundColor: THREE.ColorRepresentation;
  hemiIntensity: number;
  starIntensity: number;
}

export interface CreateAtmosphereOptions {
  isSoftwareGl?: boolean;
  castShadow?: boolean;
  config?: Partial<AtmosphereConfig>;
}

export interface SkyDomeUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uZenithColor: THREE.IUniform<THREE.Color>;
  uMidSkyColor: THREE.IUniform<THREE.Color>;
  uHorizonColor: THREE.IUniform<THREE.Color>;
  uGroundColor: THREE.IUniform<THREE.Color>;
  uSunDirection: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunGlowIntensity: THREE.IUniform<number>;
  uStarIntensity: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
}

export interface AtmosphereController {
  readonly skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly skyMaterial: THREE.ShaderMaterial;
  readonly skyUniforms: SkyDomeUniforms;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  getSunDirection: (target?: THREE.Vector3) => THREE.Vector3;
  applyMood: (partial: Partial<AtmosphereConfig>) => void;
  setShadowCenter: (x: number, z: number, halfSize?: number) => void;
  update: (dt: number, elapsed: number, cameraPosition?: THREE.Vector3) => void;
  dispose: () => void;
}

export const SKY_DOME_RADIUS = 420;
export const SHADOW_MAP_SIZE = 4096;
export const DEFAULT_SHADOW_HALF_EXTENT = 18;

export const DEFAULT_ATMOSPHERE_CONFIG: AtmosphereConfig = {
  zenithColor: '#2d9cff',
  midSkyColor: '#5ec0ff',
  horizonColor: '#a8e6ff',
  groundColor: '#8cd2f2',
  fogColor: '#b5e8ff',
  fogDensity: 0.0018,
  sunPosition: [95, 108, 65],
  sunColor: '#fff6de',
  sunIntensity: 2.38,
  sunGlowColor: '#ffeba8',
  sunGlowIntensity: 1.08,
  hemiSkyColor: '#86d2ff',
  hemiGroundColor: '#569c5b',
  hemiIntensity: 0.78,
  starIntensity: 0.0,
};

const SKY_DOME_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDir;

void main() {
  vWorldDir = normalize( position );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SKY_DOME_FRAGMENT_SHADER = /* glsl */ `
#include <common>

uniform vec3 uZenithColor;
uniform vec3 uMidSkyColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunGlowIntensity;
uniform float uStarIntensity;
uniform float uTime;

varying vec3 vWorldDir;

float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float valueNoise2D( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float cloudFbm( vec2 p ) {
  float value = 0.0;
  float amp = 0.52;
  mat2 rot = mat2( 0.80, -0.60, 0.60, 0.80 );
  for ( int i = 0; i < 4; i++ ) {
    value += amp * valueNoise2D( p );
    p = rot * p * 2.04 + vec2( 11.7, 7.3 );
    amp *= 0.5;
  }
  return value;
}

float hash31( vec3 p ) {
  p = fract( p * vec3( 443.897, 441.423, 437.195 ) );
  p += dot( p, p.yzx + 19.19 );
  return fract( ( p.x + p.y ) * p.z );
}

void main() {
  vec3 dir = normalize( vWorldDir );
  float h = dir.y;

  // Rich anime cerulean sky dome (#2d9cff zenith -> #5ec0ff mid -> #a8e6ff horizon)
  // Tuned so eye-level meadow vistas showcase deep vibrant cerulean blue + crisp cumulus clouds
  vec3 skyColor;
  if ( h >= 0.0 ) {
    float lowBand = smoothstep( 0.0, 0.085, h );
    float highBand = smoothstep( 0.055, 0.23, h );
    float deepZenithBand = smoothstep( 0.24, 0.72, h );
    skyColor = mix( uHorizonColor, uMidSkyColor, lowBand );
    skyColor = mix( skyColor, uZenithColor, highBand );
    skyColor = mix( skyColor, uZenithColor * 0.78, deepZenithBand );

    // Subtle crisp horizon glow right along the skyline
    float horizonGlow = pow( 1.0 - clamp( h, 0.0, 1.0 ), 11.0 );
    skyColor = mix( skyColor, mix( uHorizonColor, vec3( 0.96, 0.99, 1.0 ), 0.32 ), horizonGlow * 0.24 );
  } else {
    float belowBand = smoothstep( 0.0, -0.35, h );
    skyColor = mix( uHorizonColor, uGroundColor, belowBand );
  }

  // Soft golden sun scatter + crisp anime solar disc (ready for selective golden bloom)
  vec3 sunDir = normalize( uSunDirection );
  float sunCos = max( dot( dir, sunDir ), 0.0 );
  float broadHalo = pow( sunCos, 8.0 ) * 0.18;
  float tightHalo = pow( sunCos, 68.0 ) * 0.45;
  float sunDisc = smoothstep( 0.9982, 0.9994, sunCos ) * 1.45;
  float aboveHorizonMask = smoothstep( -0.05, 0.05, h );
  skyColor += uSunColor * ( broadHalo + tightHalo + sunDisc ) * uSunGlowIntensity * aboveHorizonMask;

  // Layered, soft-edged painterly white cumulus clouds drifting gently across the cerulean dome
  float daytimeCloudVis = 1.0 - smoothstep( 0.15, 0.85, uStarIntensity );
  if ( h > 0.01 && daytimeCloudVis > 0.01 ) {
    vec2 cloudUv = dir.xz / ( h + 0.22 );
    vec2 drift = vec2( uTime * 0.0085, uTime * 0.0032 );

    // Layer 1: Soft wispy high-altitude veil clouds
    float wispField = cloudFbm( cloudUv * 0.58 + drift * 0.65 + vec2( 3.1, 1.7 ) );
    float wispAlpha = smoothstep( 0.54, 0.84, wispField ) * 0.42;

    // Layer 2: Billowing sunlit anime cumulus banks with soft feathered edges & cerulean shadow bases
    vec2 warp = vec2(
      cloudFbm( cloudUv * 0.52 + vec2( 5.2, 1.3 ) + drift * 0.4 ),
      cloudFbm( cloudUv * 0.52 + vec2( 2.1, 8.4 ) - drift * 0.3 )
    );
    float cumulusBase = cloudFbm( cloudUv * 0.86 + warp * 0.58 + drift );
    float cumulusAlpha = smoothstep( 0.46, 0.66, cumulusBase );

    // Directional sun-lit white-cream crowns vs cool sky-blue cloud shadow undersides
    float cumulusLit = cloudFbm( cloudUv * 0.86 + warp * 0.58 + drift + sunDir.xz * 0.13 );
    float litFactor = smoothstep( -0.09, 0.12, cumulusBase - cumulusLit + 0.05 ) * 0.7 + 0.3;
    float sunSilver = pow( sunCos, 4.5 ) * 0.14;

    vec3 cloudShadow = mix( uHorizonColor, vec3( 0.72, 0.88, 0.99 ), 0.55 );
    vec3 cloudBright = vec3( 1.0, 0.998, 0.985 ) + uSunColor * sunSilver;
    vec3 cumulusColor = mix( cloudShadow, cloudBright, clamp( litFactor + h * 0.22, 0.0, 1.0 ) );

    float horizonFade = smoothstep( 0.012, 0.11, h ) * ( 1.0 - smoothstep( 0.74, 0.98, h ) * 0.3 );

    skyColor = mix( skyColor, vec3( 0.96, 0.985, 1.0 ), wispAlpha * horizonFade * daytimeCloudVis );
    skyColor = mix( skyColor, cumulusColor, cumulusAlpha * 0.95 * horizonFade * daytimeCloudVis );
  }

  // Crisp procedural twinkling starfield (inactive in daytime, smoothly revealed in Starlight Ruins)
  if ( uStarIntensity > 0.005 && h > 0.03 ) {
    vec3 starCell = floor( dir * 210.0 );
    float starRand = hash31( starCell );
    if ( starRand > 0.992 ) {
      vec3 cellCenter = normalize( starCell + 0.5 );
      float distToStar = length( dir - cellCenter ) * 210.0;
      float starCore = smoothstep( 0.36, 0.04, distToStar );
      float twinkle = 0.65 + 0.35 * sin( uTime * ( 1.8 + fract( starRand * 97.0 ) * 2.4 ) + starRand * 62.8 );
      float elevationMask = smoothstep( 0.03, 0.32, h );
      vec3 starTint = mix( vec3( 0.86, 0.93, 1.0 ), vec3( 1.0, 0.94, 0.82 ), fract( starRand * 31.7 ) );
      skyColor += starTint * ( starCore * twinkle * elevationMask * uStarIntensity * 1.6 );
    }
  }

  gl_FragColor = vec4( skyColor, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function resolveAtmosphereConfig(
  overrides?: Partial<AtmosphereConfig>,
): AtmosphereConfig {
  return {
    ...DEFAULT_ATMOSPHERE_CONFIG,
    ...overrides,
    sunPosition: overrides?.sunPosition ?? DEFAULT_ATMOSPHERE_CONFIG.sunPosition,
  };
}

export function computeSunDirection(
  sunPosition: readonly [number, number, number],
  target = new THREE.Vector3(),
): THREE.Vector3 {
  target.set(sunPosition[0], sunPosition[1], sunPosition[2]);
  if (target.lengthSq() < 1e-8) {
    target.set(0.5, 0.7, 0.5);
  }
  return target.normalize();
}

/**
 * Creates the stylized anime sky dome, exponential distance fog,
 * warm golden directional sun with 2048x2048 soft shadows, and sky-to-ground HemisphereLight.
 */
export function createAtmosphere(
  scene: THREE.Scene,
  options: CreateAtmosphereOptions = {},
): AtmosphereController {
  const cfg = resolveAtmosphereConfig(options.config);
  const isSoftwareGl = options.isSoftwareGl ?? false;

  const sunOffset = new THREE.Vector3(
    cfg.sunPosition[0],
    cfg.sunPosition[1],
    cfg.sunPosition[2],
  );
  const sunDir = computeSunDirection(cfg.sunPosition);

  // 1. Custom GLSL gradient sky dome
  const skyUniforms: SkyDomeUniforms = {
    uZenithColor: { value: new THREE.Color(cfg.zenithColor) },
    uMidSkyColor: { value: new THREE.Color(cfg.midSkyColor) },
    uHorizonColor: { value: new THREE.Color(cfg.horizonColor) },
    uGroundColor: { value: new THREE.Color(cfg.groundColor) },
    uSunDirection: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(cfg.sunGlowColor) },
    uSunGlowIntensity: { value: cfg.sunGlowIntensity },
    uStarIntensity: { value: cfg.starIntensity },
    uTime: { value: 0 },
  };

  const skyGeometry = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_DOME_VERTEX_SHADER,
    fragmentShader: SKY_DOME_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
  skyMesh.name = 'animeSkyDome';
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  skyMesh.castShadow = false;
  skyMesh.receiveShadow = false;
  scene.add(skyMesh);

  // Clear solid scene background so the GLSL sky dome always renders unobstructed
  scene.background = null;

  // 2. Soft exponential distance fog matched to creamy-azure horizon
  const fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
  scene.fog = fog;

  // 3. Warm golden directional sun light with 4096x4096 silky-smooth VSM anime shadows
  const sunLight = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
  sunLight.name = 'goldenSunLight';
  sunLight.position.copy(sunOffset);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = options.castShadow ?? !isSoftwareGl;
  sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunLight.shadow.camera.left = -DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.right = DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.top = DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.bottom = -DEFAULT_SHADOW_HALF_EXTENT;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 360;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.06;
  sunLight.shadow.radius = 3;
  sunLight.shadow.blurSamples = 8;
  sunLight.shadow.camera.updateProjectionMatrix();

  scene.add(sunLight);
  scene.add(sunLight.target);

  // 4. Sky-to-ground HemisphereLight for vibrant sunlit shadow bounce
  const hemiLight = new THREE.HemisphereLight(
    cfg.hemiSkyColor,
    cfg.hemiGroundColor,
    cfg.hemiIntensity,
  );
  hemiLight.name = 'valleyHemisphereLight';
  hemiLight.position.set(0, 120, 0);
  scene.add(hemiLight);

  let shadowCenterX = 0;
  let shadowCenterZ = 0;

  const applyMood = (partial: Partial<AtmosphereConfig>): void => {
    if (partial.zenithColor !== undefined) {
      skyUniforms.uZenithColor.value.set(partial.zenithColor);
    }
    if (partial.midSkyColor !== undefined) {
      skyUniforms.uMidSkyColor.value.set(partial.midSkyColor);
    }
    if (partial.horizonColor !== undefined) {
      skyUniforms.uHorizonColor.value.set(partial.horizonColor);
    }
    if (partial.groundColor !== undefined) {
      skyUniforms.uGroundColor.value.set(partial.groundColor);
    }
    if (partial.fogColor !== undefined) {
      fog.color.set(partial.fogColor);
    }
    if (partial.fogDensity !== undefined) {
      fog.density = partial.fogDensity;
    }
    if (partial.sunPosition !== undefined) {
      sunOffset.set(
        partial.sunPosition[0],
        partial.sunPosition[1],
        partial.sunPosition[2],
      );
      computeSunDirection(partial.sunPosition, skyUniforms.uSunDirection.value);
      sunLight.position.set(
        shadowCenterX + sunOffset.x,
        sunOffset.y,
        shadowCenterZ + sunOffset.z,
      );
    }
    if (partial.sunColor !== undefined) {
      sunLight.color.set(partial.sunColor);
    }
    if (partial.sunIntensity !== undefined) {
      sunLight.intensity = partial.sunIntensity;
    }
    if (partial.sunGlowColor !== undefined) {
      skyUniforms.uSunColor.value.set(partial.sunGlowColor);
    }
    if (partial.sunGlowIntensity !== undefined) {
      skyUniforms.uSunGlowIntensity.value = partial.sunGlowIntensity;
    }
    if (partial.hemiSkyColor !== undefined) {
      hemiLight.color.set(partial.hemiSkyColor);
    }
    if (partial.hemiGroundColor !== undefined) {
      hemiLight.groundColor.set(partial.hemiGroundColor);
    }
    if (partial.hemiIntensity !== undefined) {
      hemiLight.intensity = partial.hemiIntensity;
    }
    if (partial.starIntensity !== undefined) {
      skyUniforms.uStarIntensity.value = partial.starIntensity;
    }
  };

  const setShadowCenter = (
    x: number,
    z: number,
    halfSize = DEFAULT_SHADOW_HALF_EXTENT,
  ): void => {
    const cam = sunLight.shadow.camera;
    const worldUnitsPerTexel = (halfSize * 2) / SHADOW_MAP_SIZE;
    shadowCenterX = Math.round(x / worldUnitsPerTexel) * worldUnitsPerTexel;
    shadowCenterZ = Math.round(z / worldUnitsPerTexel) * worldUnitsPerTexel;

    if (cam.right !== halfSize) {
      cam.left = -halfSize;
      cam.right = halfSize;
      cam.top = halfSize;
      cam.bottom = -halfSize;
      cam.updateProjectionMatrix();
    }

    sunLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
    sunLight.position.set(
      shadowCenterX + sunOffset.x,
      sunOffset.y,
      shadowCenterZ + sunOffset.z,
    );
    sunLight.target.updateMatrixWorld();
  };

  const update = (
    _dt: number,
    elapsed: number,
    cameraPosition?: THREE.Vector3,
  ): void => {
    skyUniforms.uTime.value = elapsed;
    if (cameraPosition) {
      skyMesh.position.set(cameraPosition.x, 0, cameraPosition.z);
    }
  };

  const dispose = (): void => {
    scene.remove(skyMesh);
    scene.remove(sunLight);
    scene.remove(sunLight.target);
    scene.remove(hemiLight);
    if (scene.fog === fog) {
      scene.fog = null;
    }
    skyGeometry.dispose();
    skyMaterial.dispose();
  };

  return {
    skyMesh,
    skyMaterial,
    skyUniforms,
    sunLight,
    hemiLight,
    fog,
    getSunDirection: (target = new THREE.Vector3()) =>
      target.copy(skyUniforms.uSunDirection.value),
    applyMood,
    setShadowCenter,
    update,
    dispose,
  };
}
