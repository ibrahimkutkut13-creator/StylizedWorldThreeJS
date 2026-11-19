# Task 04: Sky Dome, Fog & Stylized Lighting

**Status:** DONE  
**Phase:** 1 — Core Engine, Toon Shader & Sky (Tasks 1–5 → Remix #1)  
**Target Module:** `src/world/atmosphere.ts`

## Objective
Create `src/world/atmosphere.ts` implementing a custom GLSL gradient sky dome (Genshin azure `#4ea8de` zenith fading into warm creamy horizon `#e0fbfc`), soft `THREE.FogExp2`, a warm golden directional sun with `2048x2048` soft shadows, and a sky-to-ground `THREE.HemisphereLight`.

## Specification
1. **Custom GLSL Gradient Sky Dome**
   - Large inverted sphere (`THREE.SphereGeometry(420, 32, 24)` with `side: THREE.BackSide`, `depthWrite: false`, `fog: false`).
   - Uniforms driven so Task 20 (World Mood presets) can smoothly interpolate them at runtime:
     - `uZenithColor`: default `#4ea8de` (Genshin azure)
     - `uMidSkyColor`: soft sky blue bridge (e.g. `#89d0f5`)
     - `uHorizonColor`: default `#e0fbfc` (warm creamy cyan-white horizon)
     - `uSunDirection`: normalized vector matching directional sun position
     - `uSunColor`: warm golden `#fff3c4`
     - `uSunGlowIntensity`: subtle glowing sun halo + crisp stylized anime solar disc in the sky
     - `uStarIntensity`: default `0.0` (ready for Task 20 Starlight Ruins mood preset)
   - Keep sky dome centered on the camera's XZ position each frame so the horizon never clips as the player explores.
2. **Exponential Distance Fog**
   - Attach `THREE.FogExp2` to `scene.fog` with a soft horizon-matched tint (`#cceef5`) and low density (`~0.0042`) so distant hills acquire painterly atmospheric depth without obscuring mid-ground landmarks.
3. **Warm Golden Directional Sun Light**
   - `THREE.DirectionalLight('#fff2d6', 2.1)` positioned at an inviting 3/4 morning-meadow angle (e.g. `(90, 120, 75)`).
   - Soft shadow configuration:
     - `castShadow = true`
     - `shadow.mapSize.set(2048, 2048)`
     - Orthographic shadow camera frustum cleanly covering the primary playable valley (`left/right/top/bottom = ±95`, `near = 10`, `far = 360`)
     - `shadow.bias = -0.0005`, `shadow.normalBias = 0.04` to eliminate shadow acne on cel-shaded terrain and structures.
4. **Sky-to-Ground Hemisphere Light**
   - `THREE.HemisphereLight('#9be2ff', '#7aa86a', 0.95)` providing luminous azure sky bounce and soft meadow ground bounce so shaded faces stay vibrant.
5. **Atmosphere Controller API**
   - Export `createAtmosphere(scene)` returning an `AtmosphereController` with:
     - `sunLight`, `hemiLight`, `fog`, `skyMesh`
     - `setMood(config)` / uniform getters for Task 20 smooth mood transitions
     - `update(dt, elapsed, cameraPosition)` (also hooks into cloud drift in Task 17)
     - `dispose()`

## Module Boundaries
- All sky shader code, lighting rigs, fog, and later drifting clouds (Task 17) reside cleanly inside `src/world/atmosphere.ts`.

## Acceptance Criteria
- Sky transitions seamlessly from `#4ea8de` azure zenith into `#e0fbfc` creamy horizon with a subtle golden sun glow.
- `FogExp2` blends distant geometry smoothly into the horizon tone.
- Directional sun casts clean `2048x2048` soft shadows without visible acne or striping.
- Hemisphere light keeps shadow areas luminous and pastel-tinted rather than dark.
