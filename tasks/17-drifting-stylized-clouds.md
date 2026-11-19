# Task 17: Drifting Stylized Anime Clouds

**Phase:** 4 — Life, Movement & Visual Polish (Tasks 16–20 → Final Base Map)  
**Target Module:** `src/world/atmosphere.ts`

## Objective
Extend `src/world/atmosphere.ts` with layered, flat-bottomed fluffy anime cloud clusters drifting slowly across the upper sky dome, shaded with sunlit warm-cream tops and soft pastel-blue/lavender undersides that respond smoothly to World Mood presets.

## Specification
1. **Flat-Bottomed Fluffy Cloud Geometry**
   - Procedurally assemble 3–4 distinct stylized cloud cluster archetypes inspired by Makoto Shinkai / Genshin Impact cumulonimbus clouds:
     - Combine 5–9 overlapping low-poly spheres/icosahedrons arranged into billowing domes, then **flatten vertices below a local base plane (`y < 0`)** smoothly so every cloud has a crisp, airy flat underside and voluminous billowy crown.
     - Compute smooth upward-biased normals across the cluster so each cloud shades as a unified painterly volume.
2. **Custom Stylized Cloud Shader / Material**
   - Avoid harsh black shadows; shade clouds using a lightweight custom toon-cloud `ShaderMaterial` (or modified toon material) with:
     - **Sunlit Crown Color**: creamy sunlit white (`#fffdf8`)
     - **Soft Shadow Underside**: airy periwinkle-azure (`#b4d8f5`)
     - **Silver-Lining Rim**: subtle warm glow when silhouetted near `uSunDirection`
     - **Horizon Fade**: smooth alpha/fog blend near the far dome edge so clouds appear and dissolve gently as they wrap across the sky rather than popping in/out.
   - Disable shadow casting/receiving (`castShadow = false`, `receiveShadow = false`) and `depthWrite = true` with clean render order ahead of the sky dome.
3. **Layered High-Altitude Drift**
   - Scatter 16–24 cloud clusters across two distinct altitude strata (mid-high cumulus around `y = 65–85` and distant horizon wisps around `y = 95–125`) over a wide circular sky span (`radius ~260`).
   - Drift clusters slowly along the valley wind vector inside `atmosphere.update(dt, elapsed)` and wrap seamlessly at the sky boundary.
   - Expose cloud top/shadow tint uniforms to `atmosphere.setMood(...)` so clouds turn apricot/rose during **Golden Sunset** and deep violet-silver during **Starlight Ruins** (Task 20).

## Module Boundaries
- Implemented as a clean internal helper (`createCloudLayer(...)`) inside `src/world/atmosphere.ts`, managed by `AtmosphereController.update(...)` and `dispose()`.

## Acceptance Criteria
- Billowy, flat-bottomed anime cloud clusters float across the upper sky dome at multiple depth layers.
- Clouds drift smoothly with zero popping at sky edges and display creamy tops + soft pastel undersides.
- Cloud colors shift seamlessly when mood presets change in Task 20.
