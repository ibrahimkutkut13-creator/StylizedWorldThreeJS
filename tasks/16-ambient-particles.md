# Task 16: Ambient Particles (Dandelion Seeds, Spirit Motes & Falling Leaves)

**Phase:** 4 — Life, Movement & Visual Polish (Tasks 16–20 → Final Base Map)  
**Target Module:** `src/world/particles.ts`

## Objective
Create `src/world/particles.ts` bringing the valley to life with drifting dandelion seeds across the meadows, floating golden/cyan spirit motes orbiting near the ancient ruins, and occasional fluttering pink/green leaves carried on the breeze.

## Specification
1. **Drifting Meadow Dandelion Seeds**
   - Lightweight `THREE.Points` or custom billboarded shader system (~180–250 particles) distributed in a looping volume around the central valley (or wrapped gently around the camera/player area so particles are always present wherever you walk).
   - Soft radial puff sprite rendered procedurally in fragment shader (no external texture dependencies), drifting lazily downwind with gentle vertical buoyancy waves and subtle sun-catch shimmer.
2. **Floating Golden Spirit Motes (Ruins Aura)**
   - ~80–120 glowing firefly/spirit particles concentrated in a rising spiral halo around `getRuinsCenter()` (and sparingly near the river pond).
   - Soft warm gold (`#ffe17d`) and pale cyan (`#8cf7ff`) emissive colors that gently pulse above the bloom threshold so they twinkle softly against the stone ruins—becoming extra luminous during the Starlight Ruins mood (Task 20).
3. **Fluttering Pink & Green Falling Leaves**
   - Instanced tiny diamond/leaf quads (`THREE.InstancedMesh`, ~90–140 leaves) drifting downward and laterally from tree canopy heights across the valley.
   - Mix soft meadow green (`#7ee05a`) and pastel sakura pink (`#ffa8cc`) petals, each tumbling smoothly with multi-axis sinusoidal pitch/roll flutter in the vertex shader or lightweight update loop before recycling smoothly back to canopy height.
4. **Performance & Lifecycle**
   - Keep GPU draw calls minimal (3 total draw calls: 1 for dandelion seeds, 1 for spirit motes, 1 instanced mesh for leaves).
   - Export `createParticles(scene, context)` returning `{ group, update(dt, elapsed, focusPos), setMood(moodSettings), dispose() }`.

## Module Boundaries
- All ambient particle emitters, procedural sprite shaders, and recycling logic live exclusively in `src/world/particles.ts`.

## Acceptance Criteria
- Dandelion seeds drift gently through sunlit meadow air across the player's view.
- Golden/cyan spirit motes rise and twinkle softly around the hillside ruin crystal.
- Occasional pink and green leaves flutter and tumble naturally on the breeze without hard pop-in or frame drops.
