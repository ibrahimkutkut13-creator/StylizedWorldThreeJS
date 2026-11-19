# Task 10: Wooden Bridges, Rope Posts & Stepping-Stones

**Phase:** 2 — Stylized Terrain & Water (Tasks 6–10 → Remix #2)  
**Target Module:** `src/world/structures.ts`

## Objective
Create `src/world/structures.ts` placing a stylized curved wooden plank bridge over the river complete with chamfered timber posts, sagging rope rails, flat stone stepping-stones across a shallow ford, and subtle plum-ink outlines.

## Specification
1. **Curved Wooden Plank Bridge**
   - Anchor cleanly at `getBridgeAnchor()` from `src/world/terrain.ts` so both ends meet the sandy footpath approaches seamlessly on opposite riverbanks.
   - **Arched Deck**: gentle parabolic arch (`archHeight ≈ 1.4` units over the water) composed of individual slightly varied chamfered wooden planks (`#b87b4b` and `#a46a3e`) resting on two curved timber stringer beams (`#7a4c2d`).
   - **Posts & Rope Railings**:
     - Vertical carved timber posts spaced evenly along both sides of the arch with decorative chamfered caps and stone abutment blocks (`#8c96b8`) anchored into the banks.
     - Catenary-curved rope segments (`THREE.TubeGeometry` along `THREE.CatmullRomCurve3` in warm hemp `#dfd0a8`) draping naturally between posts.
   - **Ink Outlines & Shadows**:
     - Shade all woodwork and stone abutments via `createAnimeToonMaterial`, apply subtle `addInkOutline(..., 0.025, '#1e1633')`, and enable `castShadow` & `receiveShadow`.
2. **Walkable Bridge Height Override**
   - Export `getStructureWalkHeight(x: number, z: number): number | null` so the third-person player (Task 18) walks smoothly up and over the curved bridge deck without sinking into the river underneath.
3. **River Stepping-Stones & Path Markers**
   - Place a secondary crossing of 5–7 flat-topped beveled stone stepping-stones (`#9aa4c2`) meandering across a shallow section of the river/pond, slightly above `WATER_LEVEL` (`+0.12` to `+0.18`), registering foam obstacles with `water.ts`.
   - Add a few weathered wooden trail signposts / stone mile-markers near path junctions for visual storytelling.

## Module Boundaries
- `src/world/structures.ts` owns functional world traversal props (bridge, stepping-stones, wooden overlook deck added in Task 15, signposts) and exposes `getStructureWalkHeight(x, z)` + `getStructureColliders()`.

## Acceptance Criteria
- Curved wooden bridge spans the river cleanly with both ends flush to the sandy dirt path.
- Individual planks, timber posts, stone abutments, and sagging catenary ropes read crisply with cel shading and subtle ink outlines.
- Stepping-stones sit cleanly above the water surface with animated water foam wrapping their bases.
- `getStructureWalkHeight(x, z)` returns accurate arch elevation across the entire bridge deck.
