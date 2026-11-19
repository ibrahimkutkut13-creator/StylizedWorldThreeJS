# Task 13: Pastel Wildflowers & Berry Bushes

**Phase:** 3 — Lush Anime Foliage & Landmarks (Tasks 11–15 → Remix #3)  
**Target Module:** `src/world/grass.ts`

## Objective
Extend `src/world/grass.ts` with instanced clusters of glowing pastel wildflowers (white, gold, sky-blue, coral) and rounded stylized berry bushes to break up flat meadow surfaces and add charming foreground color accents.

## Specification
1. **Glowing Pastel Wildflower Clusters (`THREE.InstancedMesh`)**
   - Construct a stylized multi-petal blossom + slender stem geometry (low vertex count, clean silhouette).
   - Scatter ~1,200–1,800 flowers in organic clustered patches (using Simplex noise clumping rather than uniform noise) along meadow fringes, near the riverbanks, and beside footpaths.
   - Assign per-instance colors from the exact pastel palette:
     - Crisp Daisy White: `#fffdf5`
     - Sunlit Gold: `#ffe066`
     - Sky-Blue Forget-Me-Not: `#7ad7ff`
     - Soft Coral Blossom: `#ff8f8f`
   - Apply subtle emissive lift (`emissiveIntensity ~0.25` in daytime, boostable slightly in Starlight Ruins mood in Task 20) and the same gentle wind-sway vertex shader so flower heads bob naturally with the surrounding grass.
2. **Rounded Stylized Berry Bushes**
   - Build a clustered multi-puff rounded bush archetype (3–5 merged low-poly icosahedron puffs with upward-bent smooth normals like Task 11 trees, shaded in lush deep teal-green `#3d9e54` with subtle `#1e1633` ink outline) accented with tiny clustered bright coral/ruby berries (`#ff5c77`) or pale blossoms (`#fff4cc`).
   - Scatter 50–80 bushes cleanly using `THREE.InstancedMesh` around tree bases, boulder edges, trail bends, and hillside clearings (`slope < 0.35`, outside paths/water).
   - Enable `castShadow = true` and `receiveShadow = true` on bushes for grounding.

## Module Boundaries
- Added cleanly as modular builder functions (`createWildflowers(...)`, `createBerryBushes(...)`) inside `src/world/grass.ts` and registered in the same `update(dt, elapsed)` and `dispose()` lifecycle.

## Acceptance Criteria
- Clustered patches of white, gold, sky-blue, and coral wildflowers sway with the meadow grass and break up large open lawns.
- Rounded cel-shaded berry bushes with visible berry clusters nestle naturally beside trees, rocks, and path curves.
- Zero draw-call explosion (instanced meshes keep frame times locked near 60 FPS).
