# Task 06: Rolling Stylized Terrain & Height Queries

**Status:** DONE  
**Phase:** 2 — Stylized Terrain & Water (Tasks 6–10 → Remix #2)  
**Target Module:** `src/world/terrain.ts`

## Objective
Create `src/world/terrain.ts` generating a `300x300` stylized valley with flat walkable meadows, gentle rolling hills, a carved river basin, and clean terraced cliffs (inspired by Valorant / Fortnite readable silhouettes) using deterministic seeded Simplex noise.

## Specification
1. **Deterministic Seeded Simplex Noise**
   - Implement a self-contained, zero-dependency (or lightweight typed) deterministic 2D Simplex noise generator seeded by a constant (e.g. `WORLD_SEED = 4219`) so every run produces the exact same landmarks, riverbeds, and hills.
2. **Valley Layout & Macro Topography (`300 x 300`, e.g. `180 x 180` segments)**
   - **Central Walkable Meadow & River Basin**: gentle valley floor around `y = 0.0` to `y = 3.5` with a smooth sinuous river channel carved below `WATER_LEVEL` (`y = -0.35`, channel bed down to `~ -2.4`) and a tranquil pond widening in the mid-valley.
   - **Rolling Hills & Terraced Cliffs**: outer rim and focal ridges rise to `y = 12` to `y = 28` using a stylized terrace-shaping function (`terrace(h, stepHeight, sharpness)`) that produces clean, readable stepped plateaus and flat walkable shelves rather than noisy rocky bumps.
   - **Dedicated Landmark Plateaus**:
     - Flatten a readable elevated hilltop plaza (e.g. north-east hill around `y ≈ 11`) for the Ancient Ruins Landmark (Task 14).
     - Shape a highest scenic hill crest (e.g. west/north-west ridge around `y ≈ 16`) for the wooden scenic overlook deck (Task 15).
     - Carve a gentle winding footpath corridor from the spawn meadow across the river crossing up toward the ruin plaza and overlook.
3. **Pure Query API (Shared Across All World Modules)**
   - Export deterministic query functions so rocks, bridges, trees, grass, ruins, and the third-person player all align cleanly to the ground:
     - `TERRAIN_SIZE = 300`
     - `WATER_LEVEL = -0.35`
     - `getTerrainHeight(x: number, z: number): number`
     - `getTerrainNormal(x: number, z: number): THREE.Vector3`
     - `getTerrainSlope(x: number, z: number): number` (0 = flat, 1 = vertical)
     - `getRiverCenterX(z: number): number` / `getRiverSignedDistance(x: number, z: number): number`
     - `getPathDistance(x: number, z: number): number`
     - `getRuinsCenter(): THREE.Vector3` & `getOverlookCenter(): THREE.Vector3`
     - `getBridgeAnchor(): { position: THREE.Vector3; rotationY: number; span: number }`
4. **Mesh Setup**
   - Build `THREE.PlaneGeometry(300, 300, 180, 180)` rotated to XZ, displace vertex Y via `getTerrainHeight(x, z)`, call `computeVertexNormals()`, enable `receiveShadow = true`, and apply `createAnimeToonMaterial('#ffffff', { vertexColors: true })`.

## Module Boundaries
- `src/world/terrain.ts` is the single source of truth for topography, river channel coordinates, path curves, and landmark plateau positions.
- Keep biome vertex coloring cleanly organized as a dedicated helper function inside `terrain.ts` (implemented in Task 07).

## Acceptance Criteria
- `300x300` valley renders with smooth meadows, terraced cliff ledges, a carved riverbed/pond, and flat landmark plateaus.
- `getTerrainHeight(x, z)` matches the rendered mesh height at any `(x, z)` within `< 0.05` units.
- Deterministic seed guarantees reproducible geometry on every reload.
