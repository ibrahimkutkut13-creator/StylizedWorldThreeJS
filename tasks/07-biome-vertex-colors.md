# Task 07: Stylized Biome Vertex Colors

**Status:** DONE  
**Phase:** 2 — Stylized Terrain & Water (Tasks 6–10 → Remix #2)  
**Target Module:** `src/world/terrain.ts`

## Objective
Paint the `300x300` terrain mesh in `src/world/terrain.ts` using sharp, stylized anime vertex-color blending: vibrant Genshin meadow green (`#6ccb5f`), warm sandy dirt paths (`#e6c29f`), and cool slate cliff faces (`#7b8cde`) driven by terrain slope, elevation, riverbanks, and footpath curves.

## Specification
1. **Color Palette**
   - **Vibrant Meadow Green**: `#6ccb5f` (with subtle sunlit chartreuse highlight `#84dc68` on higher gentle hills and richer emerald `#52b150` in lush valley hollows for painterly variation)
   - **Warm Sandy Dirt Paths & Riverbanks**: `#e6c29f` (with a slightly warmer shoreline sand `#ebd0ad` near `WATER_LEVEL` and deeper riverbed pebble-teal `#4e7d8a` underwater)
   - **Cool Slate Cliff Faces**: `#7b8cde` (with darker indigo-slate crevice shading `#6170bf` on near-vertical drops)
2. **Sharp Stylized Blending Rules**
   - Avoid muddy, over-soft 50/50 gradients. Use tight `smoothstep` transitions (band width `~0.08`–`0.14`) so biome boundaries read like crisp hand-painted anime brushwork:
     - **Cliffs (`slope > 0.42`)**: transition sharply to cool slate `#7b8cde`.
     - **Footpaths (`getPathDistance(x, z) < pathWidth`)**: paint warm sandy dirt `#e6c29f` along the winding trail connecting the spawn meadow, wooden bridge crossing, ruins plaza, and scenic overlook.
     - **Riverbanks & Pond Edge (`height` near `WATER_LEVEL ± 0.55`)**: paint sandy shore `#e6c29f` transitioning into riverbed tone below water level.
     - **Meadows (default walkable slopes)**: vibrant meadow green `#6ccb5f` modulated gently with low-frequency Simplex noise patches so large plains feel alive and painterly.
3. **Vertex Color Attribute & Surface Classifier**
   - Populate `geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))` in linear color space (`color.convertSRGBToLinear()` or `THREE.Color.setHex(...)` which Three.js stores in linear working space when color management is enabled).
   - Export a `getTerrainBiomeAt(x: number, z: number): 'meadow' | 'path' | 'cliff' | 'shore' | 'water'` helper so Tasks 09, 11, 12, and 13 place grass, wildflowers, trees, and boulders strictly on valid biomes (e.g., no grass growing in the middle of dirt paths or underwater).

## Module Boundaries
- Implemented cleanly inside `src/world/terrain.ts` via a dedicated `applyBiomeVertexColors(geometry)` function and `getTerrainBiomeAt(x, z)` query.

## Acceptance Criteria
- Meadows render vibrant `#6ccb5f`, winding paths and shores render warm `#e6c29f`, and steep terraced cliffs render crisp `#7b8cde`.
- Transitions between grass, path, and cliff are tight and painterly, not muddy or speckled.
- `getTerrainBiomeAt(x, z)` accurately aligns with the painted visual regions.
