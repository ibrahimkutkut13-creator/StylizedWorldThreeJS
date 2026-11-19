# Task 12: Wind-Animated Instanced Grass Field

**Phase:** 3 — Lush Anime Foliage & Landmarks (Tasks 11–15 → Remix #3)  
**Target Module:** `src/world/grass.ts`

## Objective
Create `src/world/grass.ts` scattering 20,000+ instanced tapered grass blades across green meadow terrain slopes using `THREE.InstancedMesh` driven by a custom vertex wind-wave shader and a rich root-to-tip emerald-to-lime color gradient.

## Specification
1. **Tapered Grass Blade Geometry**
   - Build a lightweight, segmented curved blade (or 2-blade crossed tuft) `BufferGeometry` (5–7 vertices per blade, tapering cleanly to a pointed tip with slight natural arc and `vHeight` attribute from `0.0` at root to `1.0` at tip).
   - Point vertex normals predominantly upward `(0, 1, 0)` (blended slightly with underlying terrain normal) so grass integrates seamlessly with the `#6ccb5f` meadow terrain without dark seam lines.
2. **20,000+ Instanced Placement (`THREE.InstancedMesh`)**
   - Deterministically scatter `24,000` (configurable for low-end / software WebGL scaling in Task 20) blades across `'meadow'` terrain biomes where `slope < 0.36`, `height > WATER_LEVEL + 0.55`, `pathDistance > pathWidth + 0.6`, and outside stone plazas/bridges.
   - Store per-instance world transform (position snapped to `getTerrainHeight`, random yaw, varied scale `0.75–1.35`) and per-instance color/phase variation (`aRandom`).
   - Set `castShadow = false` (critical for 60 FPS) and `receiveShadow = true` (or sample sun shadow/tint cleanly) with `frustumCulled = true` and accurate bounding sphere.
3. **Custom Vertex Wind-Wave Shader**
   - Animate blade tips (`weight = pow(vHeight, 1.8)`) with layered directional rolling wind waves:
     - Broad sweeping meadow gusts using world-space XZ phase (`sin(worldPos.x * 0.08 + worldPos.z * 0.06 - uTime * 2.2)`)
     - Fine flutter turbulence per blade using `aRandom`
     - Optional subtle player push-away uniform (`uPlayerPos`) ready for Task 18 so grass parts gently around the player's footsteps!
4. **Root-to-Tip Emerald-to-Lime Gradient**
   - Fragment shader interpolates smoothly (with crisp stylized highlight catch near wind crests) from deep meadow emerald at the root (`#3e9944`) to bright sunlit lime at the tips (`#a8eb65`), plus soft `FogExp2` distance blending and subtle mood tinting for Task 20.

## Module Boundaries
- `src/world/grass.ts` owns instanced meadow ground cover (grass blades here + wildflowers & bushes in Task 13).
- Exports `{ group, update(dt, elapsed, playerPos?), setMoodTint(...), dispose() }`.

## Acceptance Criteria
- 20,000+ tapered grass blades blanket green meadow slopes cleanly without encroaching onto sandy paths, river water, cliffs, or plazas.
- Visible rolling wind waves sweep organically across the meadow at 60 FPS.
- Root-to-tip emerald-to-lime gradient blends seamlessly into the `#6ccb5f` meadow floor.
