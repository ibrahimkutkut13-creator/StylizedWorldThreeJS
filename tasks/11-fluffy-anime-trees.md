# Task 11: Fluffy Stylized Anime Trees

**Status:** DONE  
**Phase:** 3 — Lush Anime Foliage & Landmarks (Tasks 11–15 → Remix #3)  
**Target Module:** `src/world/trees.ts`

## Objective
Create `src/world/trees.ts` building stylized broad-leaf anime trees composed of gently curved tapered trunks and overlapping clustered icosahedron foliage puffs with custom upward-bent vertex normals so canopies shade softly, brightly, and fluffily like Genshin Impact and Fortnite.

## Specification
1. **Curved Stylized Trunks & Branches**
   - Generate 2–3 graceful trunk archetypes using `THREE.TubeGeometry` along gently curved `THREE.CatmullRomCurve3` paths with tapered vertex radii (flared roots tapering up into 2–3 primary fork limbs).
   - Shade with `createAnimeToonMaterial('#8c5e3c', { steps: 3 })` and apply subtle `#1e1633` ink outlines on trunks.
2. **Clustered Foliage Puffs with Upward-Bent Normals**
   - Construct canopies from 5–9 overlapping `IcosahedronGeometry(radius, 2)` puffs slightly squashed/varied in scale and arranged around the upper branch tips.
   - **Custom Normal Transfer / Upward-Bending**:
     - Instead of raw sphere normals (which create harsh black undersides between overlapping puffs), recompute each canopy vertex normal by blending `(vertexPos - canopyCenter).normalize()` with an upward bias `(0, 0.55, 0)` and re-normalizing.
     - This produces the signature bright, cohesive, cloud-soft cel-shaded anime canopy silhouette.
   - **Color Palette Variation**:
     - Blend lush emerald (`#4fb848`), sunlit spring lime (`#7ee05a`), and occasional warm sakura/peach blossom accent trees (`#ff9ec4` / `#ffb8d4`) near the ruins or overlook for focal color contrast.
   - Add a subtle vertex-shader wind sway (`onBeforeCompile`) so canopy clusters breathe gently in the valley breeze.
3. **Seeded Scattering & Performance**
   - Scatter 45–65 trees across valid `'meadow'` biomes (`getTerrainBiomeAt`), respecting generous clearance from dirt paths, the river/pond, the bridge, the ancient ruins plaza, and the player spawn sightline (so the player spawns with an unobstructed heroic vista toward the bridge and hillside ruins).
   - Share geometries/materials or use `THREE.InstancedMesh` per tree archetype for minimal draw calls while keeping shadows enabled (`castShadow = true`, `receiveShadow = true`).
   - Export trunk colliders (`TreeCollider[]`) for smooth player collision (Task 18).

## Module Boundaries
- All tree trunk generation, canopy normal bending, wind sway, and tree placement live inside `src/world/trees.ts`.

## Acceptance Criteria
- Tree canopies read as soft, cohesive, brightly lit anime foliage puffs with zero harsh dark creases between overlapping icosahedrons.
- Gently curved trunks taper naturally and root cleanly into terrain slopes without floating.
- Foliage sways gently in sync with the wind; spawn vista and footpaths remain clear.
