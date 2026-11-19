# Task 09: Stylized Cliffs & Sculpted Boulders

**Status:** DONE  
**Phase:** 2 — Stylized Terrain & Water (Tasks 6–10 → Remix #2)  
**Target Module:** `src/world/rocks.ts`

## Objective
Create `src/world/rocks.ts` scattering sculpted, beveled low-poly boulders and flat-topped cliff outcrops with crisp 2-tone cel shading and deep plum-ink outlines around footpath edges, cliff bases, and riverbanks.

## Specification
1. **Procedural Sculpted Rock Archetypes**
   - Build 3–4 reusable beveled low-poly rock geometries (using perturbed `DodecahedronGeometry` / `IcosahedronGeometry` with planar face flattening and beveled facets for that clean Valorant/Fortnite chiseled silhouette):
     - **Riverbank Boulders**: rounded-beveled medium stones clustered along water edges and shallow bends (also registering their positions with `water.ts` for foam rings).
     - **Path-Edge Accent Stones**: smaller clustered rocks framing curves of the dirt path without obstructing walkability.
     - **Flat-Topped Cliff Outcrops**: larger angular stratified slabs protruding from steep `#7b8cde` cliff faces and terraced ledges to give dramatic architectural silhouette breaks.
2. **2-Tone Cel Shading & Ink Outlines**
   - Shade rocks using `createAnimeToonMaterial` from `src/world/toonMaterials.ts` with `steps: 2` (crisp 2-tone cel shading) in complementary cool slate / warm limestone hues (`#8493c9`, `#95a3d6`, `#a9b2c9`), with optional moss-cap tinting (`#6ccb5f`) on top-facing boulder faces via vertex colors.
   - Apply `addInkOutline(mesh, thickness, '#1e1633')` cleanly (using smoothed vertex normals on the outline hull so beveled edges never crack).
   - Enable `castShadow = true` and `receiveShadow = true` on rock meshes.
3. **Seeded Placement & Collision Metadata**
   - Use deterministic seeded pseudo-random placement querying `getTerrainHeight`, `getTerrainBiomeAt`, `getPathDistance`, and `getRiverSignedDistance`:
     - Never block the center of walkable dirt paths, bridge approaches, or the player spawn clearing.
     - Sink rock bases slightly (`-0.25` to `-0.6` units) into terrain so zero rocks float on slopes.
   - Export lightweight spherical/cylindrical collider descriptors (`RockCollider[]`) so the player controller (Task 18) can smoothly slide around large boulders.

## Module Boundaries
- All rock geometry generation, scattering logic, and rock collider exports live in `src/world/rocks.ts`.

## Acceptance Criteria
- Boulders and flat-topped cliff outcrops frame riverbanks, cliff walls, and path borders with readable beveled facets.
- Every rock displays crisp 2-tone cel shading and clean `#1e1633` ink outlines without cracked seams.
- Zero floating rocks on slopes; footpaths and bridge entrances remain completely unobstructed.
