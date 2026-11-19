# Task 01: Project Shell & WorldEngine

**Status:** DONE  
**Phase:** 1 — Core Engine, Toon Shader & Sky (Tasks 1–5 → Remix #1)  
**Target Modules:**
- `src/App.tsx`
- `src/world/WorldEngine.ts`

## Objective
Set up a full-screen Three.js WebGL canvas inside `App.tsx` configured with `ACESFilmicToneMapping`, `SRGBColorSpace`, and antialiasing, backed by a clean, modular `WorldEngine` class in `src/world/WorldEngine.ts` running a fixed `deltaTime` loop.

## Specification
1. **Dependencies**
   - Ensure `three` and `@types/three` are installed before importing Three.js modules.
2. **Full-Screen Canvas Mount (`src/App.tsx`)**
   - Render a full-viewport container (`w-screen h-screen overflow-hidden relative select-none`) hosting a `<canvas>` or container ref.
   - Instantiate `WorldEngine` once inside a single `useEffect(..., [])` hook so React re-renders never recreate the WebGL context or reset scene state.
   - Cleanly call `engine.dispose()` on unmount and handle window resize events without memory leaks.
3. **Renderer Configuration (`src/world/WorldEngine.ts`)**
   - Initialize `THREE.WebGLRenderer` with:
     - `antialias: true`
     - `powerPreference: 'high-performance'`
     - `renderer.outputColorSpace = THREE.SRGBColorSpace`
     - `renderer.toneMapping = THREE.ACESFilmicToneMapping`
     - `renderer.toneMappingExposure = 1.05`
     - `renderer.shadowMap.enabled = true`
     - `renderer.shadowMap.type = THREE.PCFSoftShadowMap`
     - `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
4. **Core Scene & Camera**
   - Create `THREE.Scene` and `THREE.PerspectiveCamera(50, width / height, 0.2, 600)`.
   - Provide a clean registry/lifecycle interface (`WorldSystem` with optional `update(dt: number, elapsed: number)` and `dispose()`) so every future module under `src/world/` plugs into `WorldEngine` without bloating the engine file.
5. **Fixed `deltaTime` Loop**
   - Drive updates via `requestAnimationFrame` with a clamped frame delta (`Math.min(rawDt, 0.05)`) and fixed-step accumulator (`FIXED_STEP = 1 / 60`, max sub-steps per frame = 4) for deterministic physics/movement plus smooth visual interpolation.
   - Support an optional custom render callback (used in Task 05 for `EffectComposer`) that defaults to `renderer.render(scene, camera)`.

## Module Boundaries
- `App.tsx` owns only the canvas host mount and future HUD React state (Tasks 19–20).
- `WorldEngine.ts` owns only WebGL lifecycle, scene/camera orchestration, resize handling, and fixed-timestep ticking—no geometry builders or shaders live here.

## Acceptance Criteria
- Full-screen WebGL canvas fills 100% of the viewport with zero scrollbars.
- `ACESFilmicToneMapping` and `SRGBColorSpace` are active on the renderer.
- Fixed `deltaTime` loop runs cleanly, survives tab-switching without huge `dt` spikes, and disposes cleanly on unmount.
- Resizing the viewport updates camera aspect ratio and renderer size cleanly.
