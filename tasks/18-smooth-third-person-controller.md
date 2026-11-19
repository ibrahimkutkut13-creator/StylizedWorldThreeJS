# Task 18: Smooth Third-Person Anime Character & Orbit Camera

**Phase:** 4 — Life, Movement & Visual Polish (Tasks 16–20 → Final Base Map)  
**Target Module:** `src/world/playerController.ts`

## Objective
Create `src/world/playerController.ts` implementing a stylized anime-proportioned traveler character proxy (complete with flowing scarf/cape ribbon physics), ground & bridge height snapping, responsive movement with jump and sprint, and a silky damped third-person orbit camera.

## Specification
1. **Stylized Anime-Proportioned Character Proxy**
   - Craft a clean, charming stylized traveler figure (~1.75 units tall) using cel-shaded primitives (`createAnimeToonMaterial` + `#1e1633` ink outlines):
     - Expressive anime proportions: stylized head with layered hair silhouette & hair tuft, crisp tunic/cloak torso (cream `#f5f1e6` + azure `#3f88e5` + gold trim `#f4c95d`), articulated arms and legs that swing naturally with walk/run cadence, and a small glowing shoulder/waist charm.
     - **Flowing Scarf / Cape Ribbon Physics**: segmented trailing cloth mesh (6–8 ribbon segments simulated via lightweight Verlet or spring-chain physics) that trails dynamically behind movement, billows when sprinting/jumping, and flutters gently in the idle valley breeze.
   - Enable `castShadow = true` so the character grounds visually onto meadows and bridges.
2. **Spawn & Ground/Structure Snapping**
   - Spawn on a wide, flat walkable meadow clearing near the dirt footpath (`>= 2` paths wide), facing cleanly toward the wooden bridge and hillside ancient ruins (never facing a cliff wall or inside a boulder/tree).
   - Sample ground height each fixed step via `Math.max(getTerrainHeight(x, z), getStructureWalkHeight(x, z) ?? -Infinity, getLandmarkWalkHeight(x, z) ?? -Infinity)` so the player smoothly climbs hills, crosses the arched wooden bridge, walks up ruin stairs, and steps onto the scenic overlook deck.
   - Prevent walking into deep pond water (`height < WATER_LEVEL - 0.55`) or steep unwalkable cliffs (`slope > 0.58`), and smoothly slide around tree/boulder/pillar colliders.
3. **Controls, Sprint, Jump & Stamina**
   - Listen on `window` for `WASD` / Arrow keys (camera-relative planar movement), `Shift` to sprint (draining stamina `0–100` smoothly and regenerating after a brief recovery delay), and `Space` to jump with crisp anime gravity arc + gentle landing squash/bob.
   - Smoothly rotate the character mesh to face the movement direction (`slerp` / shortest-angle damping).
4. **Silky Damped Third-Person Orbit Camera**
   - Pointer drag (click-and-drag or optional pointer-lock toggle) orbits yaw/pitch (`pitch` clamped safely between `-12°` and `+58°`), plus mouse-wheel smooth zoom (`distance` clamped `4.5`–`14`).
   - Apply exponential damping (`1 - Math.exp(-lambda * dt)`) to both camera target focus (character shoulder height) and camera position, plus terrain clearance clamping so the camera never clips below the ground surface.
5. **HUD State Callback Bridge**
   - Expose a throttled / ref-backed state getter (`getHudState(): { headingDeg, stamina, isSprinting, speed, position }`) so `App.tsx` (Task 19) can update the mini-compass and stamina arc smoothly without re-mounting WebGL or calling React `setState` on every unchanged frame.

## Module Boundaries
- All character proxy geometry, scarf physics, locomotion physics, collision resolution, and third-person orbit camera logic live cleanly inside `src/world/playerController.ts`.

## Acceptance Criteria
- Character spawns on an open meadow path facing the bridge and hillside ruins with an immediate clear vista.
- `WASD` / Arrow keys, `Shift` sprint, and `Space` jump feel responsive and snap smoothly across terrain hills, curved bridge deck, ruin stairs, and overlook deck.
- Scarf/cape ribbon trails organically with motion and wind.
- Orbit camera glides smoothly with drag + scroll zoom and never clips underground.
