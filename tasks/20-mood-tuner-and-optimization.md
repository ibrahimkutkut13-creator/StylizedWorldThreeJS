# Task 20: World Mood Tuner & 60 FPS Optimization

**Phase:** 4 — Life, Movement & Visual Polish (Tasks 16–20 → Final Base Map)  
**Target Modules:**
- `src/world/moods.ts` (preset definitions & smooth interpolation controller)
- `src/components/WorldMoodPanel.tsx` (or integrated cleanly with `src/App.tsx`)
- Optimization pass across `src/world/WorldEngine.ts`, `atmosphere.ts`, `grass.ts`, `trees.ts`, `rocks.ts`

## Objective
Add a collapsible top-right **"World Mood"** panel offering three atmospheric presets (**Morning Meadow**, **Golden Sunset**, and **Starlight Ruins**) that smoothly interpolate sun angle/color, sky dome gradient, clouds, fog, water tint, lantern/ruins glow, and bloom settings, while optimizing frustum culling and shadow camera bounds for a locked 60 FPS.

## Specification
1. **Three Curated World Mood Presets (`src/world/moods.ts`)**
   - **Morning Meadow** (Default):
     - Sky: `#4ea8de` zenith → `#e0fbfc` horizon, golden sun high-east, crisp `#cceef5` fog, turquoise `#38b6ff` water, subtle bloom (`threshold: 0.92, strength: 0.28`), stars `0.0`.
   - **Golden Sunset**:
     - Sky: deep twilight cerulean `#3d5a99` zenith → warm apricot-rose `#ff9b6a` & pale gold `#ffe0a3` horizon, low sun casting long warm amber `#ffae5c` shadows, honey-peach fog `#f2bfa0`, amber-tinted clouds, heightened golden sun sparkles on water, warmer bloom (`threshold: 0.86, strength: 0.38`), lanterns & ruins warming up.
   - **Starlight Ruins**:
     - Sky: deep indigo-violet `#121738` zenith → misty twilight teal `#2a3f6b` horizon with twinkling procedural stars (`uStarIntensity: 1.0`), cool silver-blue moonlight directional shadow (`#9ec4ff`), deep mystic fog `#1e2b4d`, glowing cyan crystal pedestal & warm amber pathway lanterns popping brightly through bloom (`threshold: 0.78, strength: 0.52`), luminous spirit motes & gently glowing wildflowers.
   - Smoothly interpolate (`lerp` / color lerp over ~`1.2s`) every lighting, sky, cloud, fog, water, emissive, and bloom parameter inside `WorldEngine.update(dt)` so mood shifts feel cinematic rather than abrupt.
2. **Collapsible Top-Right "World Mood" Panel**
   - Refined translucent frosted-glass pill/card (`top-5 right-5`, matching Task 19's minimal aesthetic) with a compact toggle button (`aria-expanded`, label `"World Mood"`).
   - Expands smoothly to reveal the 3 selectable preset buttons (`Morning Meadow`, `Golden Sunset`, `Starlight Ruins`) with active indicator and clean accessible focus/hover states.
   - Respects the Task 19 `H` key HUD hide toggle so screenshot mode remains completely clean.
3. **Locked 60 FPS Optimization Pass**
   - **Shadow Frustum Tightening & Follow**: Keep the directional sun shadow camera tightly bound around the player's active vicinity (e.g. `±55` to `±70` texel-snapped to prevent shadow-edge swimming!) so `2048x2048` shadows look twice as sharp while rendering fewer shadow casters.
   - **Frustum Culling & Bounding Spheres**: Ensure every `InstancedMesh` (grass chunks, wildflowers, berry bushes, trees, rocks, falling leaves) has accurately computed bounding spheres and `frustumCulled = true`. Consider splitting the 20,000+ grass instances into 4–9 spatial grid chunks so off-camera meadow quadrants cull completely.
   - **Shadow Casting Audit**: Disable `castShadow` on grass blades, wildflowers, particles, clouds, water, and inverted-hull ink outlines; reserve shadow casting for trees, rocks, bridges, lanterns, ruins, overlook deck, and the character proxy.
   - **Draw Call & Memory Hygiene**: Verify shared geometries/materials, pixel ratio cap (`<= 2`), zero per-frame object allocations inside `update(dt)` loops (reuse scratch `Vector3` / `Color` / `Matrix4` instances), and clean `dispose()` teardown across every module in `src/world/`.

## Module Boundaries
- `src/world/moods.ts` holds all preset data and smooth transition interpolation logic, delegating updates cleanly to `atmosphere`, `water`, `postProcessing`, `landmarks`, and `particles`.
- `src/components/WorldMoodPanel.tsx` holds only the collapsible React UI wired through a single `onSelectMood(id)` callback.

## Acceptance Criteria
- Switching between **Morning Meadow**, **Golden Sunset**, and **Starlight Ruins** smoothly transitions sky, clouds, sun angle, shadows, fog, water, lanterns, ruins glow, and bloom over ~1.2 seconds with zero hitching.
- Panel collapses/expands cleanly in the top-right corner and hides when `H` is pressed.
- Tight texel-snapped shadow bounds, spatial frustum culling, zero per-frame GC churn, and proper shadow-caster pruning maintain smooth 60 FPS performance.
