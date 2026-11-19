# Task 03: Inverted-Hull Ink Outline System

**Status:** DONE  
**Phase:** 1 — Core Engine, Toon Shader & Sky (Tasks 1–5 → Remix #1)  
**Target Module:** `src/world/toonMaterials.ts`

## Objective
Add a reusable `addInkOutline(mesh, thickness, color)` helper in `src/world/toonMaterials.ts` using the inverted-hull technique (`THREE.BackSide` extruded along vertex normals) with deep plum-ink `#1e1633` instead of harsh pure black so stylized props, rocks, structures, and characters have crisp anime borders.

## Specification
1. **`addInkOutline(mesh, thickness?, color?)` API**
   - Parameters:
     - `mesh: THREE.Mesh` (the target mesh to outline)
     - `thickness: number = 0.035` (world/local extrusion distance along smoothed vertex normals)
     - `color: THREE.ColorRepresentation = '#1e1633'` (deep plum-ink default)
   - Returns the created outline `THREE.Mesh` attached as a child of `mesh` (with `name = '${mesh.name || 'mesh'}_inkOutline'`).
2. **Inverted-Hull Shader Material**
   - Create a lightweight `THREE.ShaderMaterial` (cached/keyed or lightweight per thickness/color) configured with:
     - `side: THREE.BackSide`
     - `depthWrite: true`
     - `fog: true` (or fog-aware blending so distant outlines fade naturally into horizon mist instead of turning into dark specks in the distance)
   - Vertex shader extrudes each vertex along its `normal` by `uOutlineThickness`:
     - `vec3 extruded = position + normal * uOutlineThickness;`
     - Optional subtle distance scaling clamp so outlines remain legible without bloating up close or disappearing too early.
   - Fragment shader outputs `uOutlineColor` blended with scene exponential fog (`FogExp2`) when fog is active.
3. **Hard-Edge / Flat-Shaded Geometry Safety**
   - For faceted/low-poly meshes (like beveled boulders in Task 09), split normals can cause gaps in inverted hulls. Provide an optional internal helper (`computeSmoothNormalsAttribute`) or store averaged normals by vertex position so corners stay watertight without cracks.
4. **Shadow & Raycast Discipline**
   - Outline meshes MUST set `castShadow = false`, `receiveShadow = false`, and `raycast = () => {}` so they never interfere with shadow maps or picking.
5. **Group Convenience Helper**
   - Optionally export `addInkOutlineToGroup(group, thickness, color)` to apply outlines cleanly to multi-mesh props (bridges, lanterns, ruins, character proxy) while skipping emissive cores or already-outlined meshes.

## Module Boundaries
- Lives inside `src/world/toonMaterials.ts` alongside `createAnimeToonMaterial`.

## Acceptance Criteria
- Calling `addInkOutline(mesh)` wraps the mesh in a uniform `#1e1633` deep plum-ink border visible from all angles.
- Faceted low-poly meshes show seamless outlines without detached floating faces at sharp corners.
- Outline meshes do not cast shadows or cast dark artifacts through distance fog.
