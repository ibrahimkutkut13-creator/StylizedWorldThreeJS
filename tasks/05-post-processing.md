# Task 05: Post-Processing Pipeline (Bloom & AA)

**Status:** DONE  
**Phase:** 1 — Core Engine, Toon Shader & Sky (Tasks 1–5 → Remix #1)  
**Target Module:** `src/world/postProcessing.ts`

## Objective
Create `src/world/postProcessing.ts` configuring Three.js `EffectComposer`, `RenderPass`, a restrained `UnrealBloomPass` (high threshold so only bright sky/magic highlights glow without washing out the screen), and SMAA / FXAA anti-aliasing for razor-sharp anime edges.

## Specification
1. **Composer Setup**
   - Import from `three/examples/jsm/postprocessing/*` and `three/examples/jsm/shaders/*`:
     - `EffectComposer`
     - `RenderPass`
     - `UnrealBloomPass`
     - `SMAAPass` (preferred for sharp cel-shaded ink lines) or `ShaderPass(FXAAShader)` fallback if WebGL context constraints apply
     - `OutputPass` (ensures `ACESFilmicToneMapping` and `SRGBColorSpace` output conversion run accurately at the end of the composer chain)
2. **High-Threshold Selective Bloom (`UnrealBloomPass`)**
   - Configure subtle, non-muddy bloom parameters:
     - `threshold: 0.92` (high threshold so regular meadow grass, stone, and foliage NEVER wash out, while emissive crystal pedestals in Task 14, lantern cores in Task 15, sun speculars, and sky highlights catch a soft ethereal glow)
     - `strength: 0.28`
     - `radius: 0.45`
   - Expose `setBloomSettings({ threshold, strength, radius })` so Task 20 (World Mood presets like Golden Sunset and Starlight Ruins) can smoothly tune bloom intensity.
3. **Razor-Sharp Edge Anti-Aliasing**
   - Append `SMAAPass` (or resolution-synced `FXAAShader` pass updating `uniforms['resolution']` on resize) so inverted-hull ink outlines and thin grass blades stay crisp without stair-stepping.
   - Use multisampled render target (`samples: 4` on WebGL2 `THREE.WebGLRenderTarget` with `HalfFloatType`) where supported so bloom + AA stay ultra-clean.
4. **Integration with `WorldEngine.ts`**
   - Export `createPostProcessing(renderer, scene, camera)` returning `{ composer, bloomPass, resize(w, h), render(), setBloom(...), dispose() }`.
   - Plug `postProcessing.render()` into `WorldEngine`'s render step and forward `resize(width, height)` on window resize.

## Module Boundaries
- All post-processing passes, render targets, and bloom parameter setters live solely in `src/world/postProcessing.ts`.

## Acceptance Criteria
- Scene renders through `EffectComposer` with accurate `ACESFilmicToneMapping` + `SRGBColorSpace` color fidelity (no double tone-mapping or gamma washout).
- Standard matte cel-shaded objects do NOT bloom; emissive objects (`emissiveIntensity > 1.2`) produce a soft, tasteful halo.
- Ink outlines and diagonal silhouettes render cleanly without jagged aliasing.
- Window resize cleanly resizes all composer targets and AA uniforms.
