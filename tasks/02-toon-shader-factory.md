# Task 02: Anime Toon Shader Factory

**Status:** DONE  
**Phase:** 1 — Core Engine, Toon Shader & Sky (Tasks 1–5 → Remix #1)  
**Target Module:** `src/world/toonMaterials.ts`

## Objective
Create `src/world/toonMaterials.ts` providing a reusable `createAnimeToonMaterial(hexColor, options)` factory built on `THREE.MeshToonMaterial` with a crisp 3-step nearest-filter `DataTexture` gradient map, warm shadow tinting, and a subtle fresnel rim highlight.

## Specification
1. **3-Step Nearest-Filter Gradient Map**
   - Build a cached singleton `THREE.DataTexture` (`3 x 1`, `THREE.RedFormat` or `THREE.RGBAFormat`, `UnsignedByteType`) representing three crisp anime cel-shading bands (deep shadow, mid-tone, bright lit band — e.g. luminosity steps `[95, 175, 255]`).
   - Set `minFilter = THREE.NearestFilter`, `magFilter = THREE.NearestFilter`, `generateMipmaps = false`, and `needsUpdate = true` so shading bands stay razor-sharp without blurry interpolation.
   - Optionally expose a `2-step` gradient variant (for Task 09 cliffs/boulders crisp 2-tone cel shading) via `options.steps?: 2 | 3`.
2. **`createAnimeToonMaterial(hexColor, options)` API**
   - Parameters:
     - `hexColor: THREE.ColorRepresentation`
     - `options?: AnimeToonOptions`:
       - `steps?: 2 | 3` (default `3`)
       - `shadowTint?: THREE.ColorRepresentation` (default warm lavender-plum/peach-shifted shadow tint such as `#5a4a78` or warm ambient lift so shadows never look muddy gray)
       - `shadowTintStrength?: number` (default `0.25`)
       - `rimColor?: THREE.ColorRepresentation` (default `#fff6e0` warm sunlight rim)
       - `rimPower?: number` (default `3.2`)
       - `rimIntensity?: number` (default `0.35`)
       - `vertexColors?: boolean` (default `false`)
       - `side?: THREE.Side` (default `THREE.FrontSide`)
       - `emissive?: THREE.ColorRepresentation`
       - `emissiveIntensity?: number`
       - `flatShading?: boolean`
   - Use `onBeforeCompile` on `THREE.MeshToonMaterial` (with a stable `customProgramCacheKey`) to inject:
     - **Warm shadow tint**: blend darkened shadow regions toward `uShadowTint` instead of pure black.
     - **Subtle rim highlight**: view-space Fresnel term `pow(1.0 - saturate(dot(normal, viewDir)), uRimPower) * uRimIntensity` tinted by `uRimColor` and masked gently by upward/sun-facing orientation so silhouettes pop like Genshin Impact / cel-shaded anime art.
3. **Disposal & Caching**
   - Share gradient textures across all created materials so GPU texture memory remains minimal.

## Module Boundaries
- Keep all cel-shading material helpers, gradient map generators, and outline helpers (Task 03) consolidated in `src/world/toonMaterials.ts`.
- Do not place scene objects or geometry generators in this file.

## Acceptance Criteria
- `createAnimeToonMaterial` returns a valid `THREE.MeshToonMaterial` with 3 crisp cel steps visible on curved geometry.
- Shadows exhibit a clean warm/stylized tint rather than muddy gray/black.
- Grazing angles show a subtle, readable anime rim highlight without washing out base colors.
- Supports `vertexColors: true` cleanly for terrain (Task 07).
