import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { RenderPipeline } from './WorldEngine';

export type AntiAliasingMode = 'smaa' | 'fxaa' | 'none';

export interface BloomSettings {
  /** Luminance threshold above which bright emissives/sky highlights bloom (default: 0.92). */
  threshold: number;
  /** Subtle bloom intensity (default: 0.28). */
  strength: number;
  /** Bloom blur spread radius in [0, 1] (default: 0.45). */
  radius: number;
}

export interface PostProcessingOptions {
  bloom?: Partial<BloomSettings>;
  aaMode?: AntiAliasingMode;
  isSoftwareGl?: boolean;
  /**
   * When true, `render()` falls back to `renderer.render(scene, camera)` to avoid
   * multi-pass CPU bottlenecks on software WebGL (SwiftShader), while keeping
   * the composer and bloom parameters configured identically for hardware GPUs.
   */
  bypassComposer?: boolean;
  /** MSAA sample count on the internal HDR render target (default: 4 on WebGL2 GPUs). */
  samples?: number;
}

export interface PostProcessingController extends RenderPipeline {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloomPass: UnrealBloomPass;
  readonly outputPass: OutputPass;
  readonly aaMode: AntiAliasingMode;
  readonly renderTarget: THREE.WebGLRenderTarget;
  isBypassingComposer: () => boolean;
  setBypassComposer: (bypass: boolean) => void;
  getBloomSettings: () => BloomSettings;
  setBloomSettings: (updates: Partial<BloomSettings>) => void;
  render: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export const DEFAULT_BLOOM_SETTINGS: Readonly<BloomSettings> = {
  threshold: 0.88,
  strength: 0.26,
  radius: 0.52,
};

/** Subtle warm sunlit golden mip tints so sunlit tree crowns and flowers glow softly. */
export const GOLDEN_BLOOM_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.97, 0.88],
  [1.0, 0.95, 0.84],
  [1.0, 0.93, 0.8],
  [1.0, 0.91, 0.76],
  [1.0, 0.89, 0.72],
];

export function clampBloomSettings(
  input: Partial<BloomSettings> = {},
  base: BloomSettings = DEFAULT_BLOOM_SETTINGS,
): BloomSettings {
  const threshold = THREE.MathUtils.clamp(
    input.threshold ?? base.threshold,
    0.0,
    4.0,
  );
  const strength = THREE.MathUtils.clamp(
    input.strength ?? base.strength,
    0.0,
    2.5,
  );
  const radius = THREE.MathUtils.clamp(input.radius ?? base.radius, 0.0, 1.0);

  return { threshold, strength, radius };
}

export function resolveAntiAliasingMode(
  requested?: AntiAliasingMode,
): AntiAliasingMode {
  if (requested === 'none' || requested === 'fxaa') {
    return requested;
  }
  // SMAAPass constructs HTMLImageElement lookup textures internally; fall back to FXAA if unavailable.
  if (typeof Image === 'undefined') {
    return 'fxaa';
  }
  return 'smaa';
}

export function computeFxaaInverseResolution(
  width: number,
  height: number,
  pixelRatio: number,
): { x: number; y: number } {
  const safeRatio = Math.max(0.5, pixelRatio || 1);
  const safeW = Math.max(1, width * safeRatio);
  const safeH = Math.max(1, height * safeRatio);
  return { x: 1 / safeW, y: 1 / safeH };
}

/**
 * Builds the Phase 1 stylized post-processing pipeline:
 * - Linear HDR HalfFloat WebGLRenderTarget (4x MSAA on WebGL2 hardware GPUs)
 * - RenderPass
 * - High-threshold subtle UnrealBloomPass (only bright magic/lanterns/sun glow)
 * - Crisp SMAA (linear-sRGB before OutputPass) or FXAA (sRGB after OutputPass)
 * - OutputPass (exact ACESFilmicToneMapping + SRGBColorSpace transfer)
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: PostProcessingOptions = {},
): PostProcessingController {
  const isSoftwareGl = options.isSoftwareGl ?? false;
  let bypassComposer = options.bypassComposer ?? isSoftwareGl;

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const initialWidth = Math.max(1, Math.round(size.x) || window.innerWidth || 1);
  const initialHeight = Math.max(1, Math.round(size.y) || window.innerHeight || 1);
  const pixelRatio = renderer.getPixelRatio() || 1;

  const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);
  const targetSamples =
    options.samples !== undefined
      ? options.samples
      : !isSoftwareGl && isWebGL2
        ? 4
        : 0;

  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(initialWidth * pixelRatio)),
    Math.max(1, Math.round(initialHeight * pixelRatio)),
    {
      type: THREE.HalfFloatType,
      samples: targetSamples,
    },
  );
  renderTarget.texture.name = 'WorldPostProcessing.hdrTarget';

  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(initialWidth, initialHeight);

  // 1. Base scene render pass (linear HDR)
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Selective warm golden anime bloom pass (linear HDR)
  const bloomState = clampBloomSettings(options.bloom);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(initialWidth, initialHeight),
    bloomState.strength,
    bloomState.radius,
    bloomState.threshold,
  );
  if (Array.isArray(bloomPass.bloomTintColors)) {
    for (let i = 0; i < Math.min(bloomPass.bloomTintColors.length, GOLDEN_BLOOM_TINTS.length); i += 1) {
      const [r, g, b] = GOLDEN_BLOOM_TINTS[i];
      bloomPass.bloomTintColors[i].set(r, g, b);
    }
  }
  composer.addPass(bloomPass);

  // 3 & 4. Anti-aliasing + OutputPass in exact Three.js color-space order:
  // - SMAAPass operates in linear-sRGB -> placed BEFORE OutputPass.
  // - FXAAShader operates in sRGB -> placed AFTER OutputPass.
  const aaMode = resolveAntiAliasingMode(options.aaMode);
  const outputPass = new OutputPass();
  let smaaPass: SMAAPass | null = null;
  let fxaaPass: ShaderPass | null = null;

  if (aaMode === 'smaa') {
    smaaPass = new SMAAPass();
    composer.addPass(smaaPass);
    composer.addPass(outputPass);
  } else if (aaMode === 'fxaa') {
    composer.addPass(outputPass);
    fxaaPass = new ShaderPass(FXAAShader);
    const inv = computeFxaaInverseResolution(
      initialWidth,
      initialHeight,
      pixelRatio,
    );
    fxaaPass.material.uniforms.resolution.value.set(inv.x, inv.y);
    composer.addPass(fxaaPass);
  } else {
    composer.addPass(outputPass);
  }

  const resize = (width: number, height: number): void => {
    const safeW = Math.max(1, Math.round(width));
    const safeH = Math.max(1, Math.round(height));
    const ratio = renderer.getPixelRatio() || 1;

    composer.setPixelRatio(ratio);
    composer.setSize(safeW, safeH);
    bloomPass.resolution.set(safeW, safeH);

    if (fxaaPass) {
      const inv = computeFxaaInverseResolution(safeW, safeH, ratio);
      fxaaPass.material.uniforms.resolution.value.set(inv.x, inv.y);
    }
  };

  const setBloomSettings = (updates: Partial<BloomSettings>): void => {
    const next = clampBloomSettings(updates, {
      threshold: bloomPass.threshold,
      strength: bloomPass.strength,
      radius: bloomPass.radius,
    });
    bloomPass.threshold = next.threshold;
    bloomPass.strength = next.strength;
    bloomPass.radius = next.radius;
  };

  const getBloomSettings = (): BloomSettings => ({
    threshold: bloomPass.threshold,
    strength: bloomPass.strength,
    radius: bloomPass.radius,
  });

  const render = (): void => {
    if (bypassComposer) {
      renderer.render(scene, camera);
    } else {
      composer.render();
    }
  };

  const dispose = (): void => {
    bloomPass.dispose();
    smaaPass?.dispose();
    fxaaPass?.dispose();
    outputPass.dispose();
    renderTarget.dispose();
    composer.dispose();
  };

  return {
    composer,
    renderPass,
    bloomPass,
    outputPass,
    aaMode,
    renderTarget,
    isBypassingComposer: () => bypassComposer,
    setBypassComposer: (bypass: boolean) => {
      bypassComposer = bypass;
    },
    getBloomSettings,
    setBloomSettings,
    render,
    resize,
    dispose,
  };
}
