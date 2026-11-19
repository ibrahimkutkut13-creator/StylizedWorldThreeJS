# Task 08: Stylized Toon Water River & Pond

**Status:** DONE  
**Phase:** 2 — Stylized Terrain & Water (Tasks 6–10 → Remix #2)  
**Target Module:** `src/world/water.ts`

## Objective
Create `src/world/water.ts` adding a winding river and tranquil pond across the valley floor with a custom GLSL toon water shader featuring a turquoise `#38b6ff` base, animated crisp white foam lines along shorelines and submerged rocks, and soft specular sun sparkles.

## Specification
1. **Water Geometry**
   - Place a subdivided plane (`THREE.PlaneGeometry` sized to cover the carved river valley and pond footprint, positioned at `y = WATER_LEVEL` from `terrain.ts`) so vertices carry precomputed shoreline proximity/depth attributes (`aDepth = WATER_LEVEL - getTerrainHeight(x, z)` and optional `aObstacleDist` for bridge piers and riverbank boulders).
   - Alternatively support a depth/shore mask baked per vertex (`aShoreFactor`) plus procedural animated ripple noise so shoreline foam hugs every curve of the river, pond, and stepping-stones accurately without expensive extra depth-prepass render targets.
2. **Custom Toon Water Shader (`THREE.ShaderMaterial`)**
   - **Base Palette**:
     - Shallow turquoise: `#6be0ff`
     - Mid/base turquoise: `#38b6ff`
     - Deep tranquil pond blue: `#1f8ad8`
     - Crisp anime foam white: `#f4fdff`
   - **Animated Shoreline & Rock Foam**:
     - Compute undulating foam bands near shallow depths (`aDepth < 0.55`) and rock proximity using scrolling 2D Voronoi/Simplex noise + `sin(aDepth * freq - uTime * speed)` quantized with `step()` for crisp anime foam ribbons.
     - Add subtle downstream flow streaks along the river's flow direction.
   - **Soft Specular Sun Sparkles**:
     - Sample high-frequency scrolling wave normal perturbation and compute stylized step-thresholded sun glints aligned to `uSunDirection` (triggering subtle bloom highlights from Task 05 when bright).
   - **Stylized Transparency & Fog**:
     - Slight opacity gradient (`0.78` in shallows → `0.94` in deep pond) so sandy riverbeds peek through near the shore, blended cleanly with `FogExp2`.
3. **Runtime Uniforms & Mood Hooks**
   - Export `createWater(scene, terrainData)` returning `{ mesh, update(dt, elapsed), setSunDirection(dir), setMoodTint(baseHex, deepHex, sparkleHex), registerFoamObstacle(x, z, radius), dispose() }`.

## Module Boundaries
- All water geometry and GLSL shader code live exclusively in `src/world/water.ts`.
- Reads `WATER_LEVEL` and `getTerrainHeight` from `src/world/terrain.ts`.

## Acceptance Criteria
- Winding river and pond sit cleanly inside the carved valley floor without Z-fighting against the terrain.
- Crisp white animated foam ribbons trace the shorelines and wrap around river rocks/stepping stones.
- Subtle sun sparkles shimmer across the `#38b6ff` turquoise surface as the camera moves.
- Water color responds cleanly to mood preset updates (Task 20).
