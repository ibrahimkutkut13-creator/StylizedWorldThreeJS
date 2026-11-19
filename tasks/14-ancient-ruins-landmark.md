# Task 14: Ancient Ruins Hillside Landmark

**Phase:** 3 — Lush Anime Foliage & Landmarks (Tasks 11–15 → Remix #3)  
**Target Module:** `src/world/landmarks.ts`

## Objective
Create `src/world/landmarks.ts` building a focal-point hillside ruin plaza featuring weathered carved stone pillars, broken archways, inlaid plaza flagstones, and a central glowing cyan/gold floating crystal pedestal that serves as the world's unmistakable Genshin / Valorant visual anchor.

## Specification
1. **Hillside Ruin Plaza Foundation**
   - Position squarely on the flattened hillside plateau returned by `getRuinsCenter()` from `src/world/terrain.ts` so it is prominently framed on the skyline from the player's starting meadow.
   - Build a multi-tiered circular stone dais (stepped octagonal/circular rings of weathered pale travertine stone `#d8d3c8` and cool shadow stone `#9ba4bf` with radial inlaid runes and moss tufts).
   - Include a wide stone stairway leading down toward the incoming dirt footpath.
2. **Weathered Stone Pillars & Broken Archways**
   - Arrange 6–8 fluted/beveled ancient columns around the perimeter of the plaza:
     - Mix intact tall pillars supporting carved lintels/archways with cleanly fractured, tilted, and moss-draped broken pillars and fallen column drums.
     - Apply `createAnimeToonMaterial` + `#1e1633` ink outlines and `castShadow = true` / `receiveShadow = true`.
3. **Central Floating Cyan/Gold Crystal Pedestal**
   - Sculpt an ornate tiered pedestal at the center of the plaza holding rotating golden astrolabe/halo rings (`#ffd166` with warm metallic emissive sheen) orbiting an elongated faceted crystal shard (`#3df5ff` core with `#9efcff` rim glow).
   - Set crystal `emissiveIntensity` above the Task 05 bloom threshold (`~1.5–1.8`) so `UnrealBloomPass` produces a crisp magical cyan-gold halo without washing out nearby stonework.
   - Animate smoothly inside `update(dt, elapsed)`:
     - Gentle sinusoidal levitation bob + slow axial spin on the crystal
     - Counter-rotating tilted golden rings
     - Soft local `THREE.PointLight('#52f2ff', 2.2, 18)` pulsing subtly to cast magical bounce light onto the surrounding pillars (and shine dramatically in Task 20's Starlight Ruins preset).
4. **Walkable Surface & Colliders**
   - Export `getLandmarkWalkHeight(x, z)` for the stepped dais & stairs, plus cylindrical colliders for intact pillars and the central pedestal.

## Module Boundaries
- `src/world/landmarks.ts` owns hero architectural focal points (Ancient Ruins Plaza here, plus Torii gate & stone lanterns in Task 15).

## Acceptance Criteria
- Hillside ruin plaza forms a striking silhouette visible from across the valley.
- Weathered pillars, broken archways, and stepped stonework feature crisp cel shading, shadows, and plum-ink outlines.
- Central floating cyan/gold crystal bobs smoothly with orbiting rings and emits a controlled bloom glow.
