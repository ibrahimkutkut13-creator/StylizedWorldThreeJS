import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DEFAULT_BLOOM_SETTINGS,
  clampBloomSettings,
  computeFxaaInverseResolution,
  createPostProcessing,
  resolveAntiAliasingMode,
} from './postProcessing';

function createMockRenderer(width = 1280, height = 720, pixelRatio = 2) {
  let directRenderCount = 0;
  const renderer = {
    capabilities: { isWebGL2: true },
    getSize: (target: THREE.Vector2) => target.set(width, height),
    getPixelRatio: () => pixelRatio,
    render: () => {
      directRenderCount += 1;
    },
  };
  return {
    renderer: renderer as unknown as THREE.WebGLRenderer,
    getDirectRenderCount: () => directRenderCount,
  };
}

test('clampBloomSettings preserves warm golden bloom defaults and clamps out-of-range inputs', () => {
  const defaults = clampBloomSettings();
  assert.deepEqual(defaults, DEFAULT_BLOOM_SETTINGS);
  assert.equal(defaults.threshold, 0.88);
  assert.equal(defaults.strength, 0.26);
  assert.equal(defaults.radius, 0.52);

  const clamped = clampBloomSettings({
    threshold: -1.5,
    strength: 99,
    radius: 2.5,
  });
  assert.equal(clamped.threshold, 0.0);
  assert.equal(clamped.strength, 2.5);
  assert.equal(clamped.radius, 1.0);
});

test('computeFxaaInverseResolution scales accurately by viewport size and pixelRatio', () => {
  const inv = computeFxaaInverseResolution(1440, 900, 2);
  assert.ok(Math.abs(inv.x - 1 / 2880) < 1e-9);
  assert.ok(Math.abs(inv.y - 1 / 1800) < 1e-9);
});

test('resolveAntiAliasingMode falls back safely to fxaa when Image is unavailable in Node', () => {
  assert.equal(resolveAntiAliasingMode('fxaa'), 'fxaa');
  assert.equal(resolveAntiAliasingMode('none'), 'none');
  // In Node.js test runtime (no DOM Image), default 'smaa' degrades safely to 'fxaa'
  const expectedDefault = typeof Image === 'undefined' ? 'fxaa' : 'smaa';
  assert.equal(resolveAntiAliasingMode(undefined), expectedDefault);
});

test('createPostProcessing builds HDR composer chain with bloom tuning, FXAA resize, and software bypass', () => {
  const { renderer, getDirectRenderCount } = createMockRenderer(1440, 900, 2);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1440 / 900, 0.2, 600);

  const pp = createPostProcessing(renderer, scene, camera, {
    aaMode: 'fxaa',
    isSoftwareGl: true,
  });

  // Pass order for FXAA: RenderPass -> UnrealBloomPass -> OutputPass -> FXAA ShaderPass
  assert.equal(pp.composer.passes.length, 4);
  assert.equal(pp.composer.passes[0], pp.renderPass);
  assert.equal(pp.composer.passes[1], pp.bloomPass);
  assert.equal(pp.composer.passes[2], pp.outputPass);
  assert.equal(pp.aaMode, 'fxaa');
  assert.equal(pp.renderTarget.texture.type, THREE.HalfFloatType);
  assert.equal(pp.isBypassingComposer(), true);

  // Software-WebGL bypass renders directly without failing on headless mock
  pp.render();
  assert.equal(getDirectRenderCount(), 1);

  // Live bloom parameter updates for Task 20 mood presets
  pp.setBloomSettings({ threshold: 0.78, strength: 0.52, radius: 0.6 });
  assert.deepEqual(pp.getBloomSettings(), {
    threshold: 0.78,
    strength: 0.52,
    radius: 0.6,
  });

  // Resize updates bloom & FXAA uniforms cleanly
  pp.resize(1024, 640);
  assert.equal(pp.bloomPass.resolution.x, 1024);
  assert.equal(pp.bloomPass.resolution.y, 640);

  pp.dispose();
});
