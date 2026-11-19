# Task 15: Stylized Torii Gate, Pathway Lanterns & Scenic Overlook Deck

**Phase:** 3 — Lush Anime Foliage & Landmarks (Tasks 11–15 → Remix #3)  
**Target Module:** `src/world/landmarks.ts` (Torii & lanterns) + `src/world/structures.ts` (scenic overlook deck)

## Objective
Add a stylized vermilion-wood Torii entrance gate framing the path ascent, carved stone pathway lanterns with warm emissive cores (triggering soft bloom), and a timber scenic overlook deck perched atop the highest hill in the valley.

## Specification
1. **Stylized Torii Gate (`src/world/landmarks.ts`)**
   - Place a striking anime-stylized Torii gate straddling the dirt path where it climbs from the bridge toward the hillside ruins (or framing the scenic overlook trailhead).
   - Geometry: two subtly splayed cylindrical/octagonal vermilion columns (`#d94b3d`) anchored in dark slate stone plinths (`#4b5373`), topped with a curved upturned lintel (`kasagi`, dark charcoal-plum `#2d2842` cap + vermilion lower beam), secondary tie beam (`nuki`), and decorative central tablet (`gakuzuka`) with subtle gold trim (`#f4c95d`).
   - Apply `createAnimeToonMaterial` + `#1e1633` ink outlines and shadows.
2. **Carved Stone Pathway Lanterns (`src/world/landmarks.ts`)**
   - Craft a stylized stone lantern (`tōrō`) archetype: pedestal base, tapered shaft, carved fire-box chamber with open lattice cutouts, flared pagoda roof cap, and lotus finial.
   - Inside each fire-box, place a warm golden-amber emissive core (`#ffbe55`, `emissiveIntensity: 1.6` in daytime, smoothly boosted to `2.4` in Golden Sunset / Starlight Ruins in Task 20) so `UnrealBloomPass` renders cozy glowing lantern halos.
   - Place 10–14 lanterns spaced gracefully along the winding footpath, flanking the bridge approaches, lining the Torii approach, and encircling the ruin stairs.
   - Support a subtle flickering/breathing emissive intensity pulse inside `update(dt, elapsed)`.
3. **Wooden Scenic Overlook Deck (`src/world/structures.ts`)**
   - Build a cantilevered timber viewing deck perched on the highest hill plateau returned by `getOverlookCenter()` from `src/world/terrain.ts`, oriented to look out across the entire valley, winding river, wooden bridge, and distant glowing ancient ruins.
   - Include sturdy diagonal timber support struts anchored into the cliff face, warm plank flooring, wooden safety railings with rope/post details matching the bridge aesthetic, and a cozy wooden bench + corner stone lantern.
   - Register the deck floor with `getStructureWalkHeight(x, z)` so the player can walk right out to the railing edge for panoramic screenshots.

## Module Boundaries
- Torii gate and stone pathway lanterns live in `src/world/landmarks.ts` (exposing lantern emissive controls for Task 20).
- Scenic overlook deck lives in `src/world/structures.ts` alongside the wooden bridge so all walkable timber structures share `getStructureWalkHeight(x, z)`.

## Acceptance Criteria
- Torii gate cleanly frames the footpath with crisp vermilion/slate cel shading and ink outlines.
- Stone pathway lanterns emit soft warm golden bloom halos along the trails and bridge approaches without washing out nearby terrain.
- Scenic overlook deck sits solidly on the highest hill crest with unobstructed views across the valley and full player walkability.
