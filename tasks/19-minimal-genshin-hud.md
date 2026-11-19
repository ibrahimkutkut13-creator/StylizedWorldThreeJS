# Task 19: Ultra-Minimal Translucent Anime HUD

**Phase:** 4 — Life, Movement & Visual Polish (Tasks 16–20 → Final Base Map)  
**Target Modules:**
- `src/App.tsx`
- `src/components/WorldHud.tsx` (optional small extracted HUD component to keep `App.tsx` slim)

## Objective
Build a clean, ultra-minimal translucent HUD overlay inspired by Genshin Impact featuring a top-left circular mini-compass, a subtle bottom curved stamina arc that appears only while sprinting/recovering, and a toggleable `H` key to hide all UI for pure unobstructed screenshots.

## Specification
1. **Top-Left Circular Mini-Compass**
   - Translucent frosted glass disc (`backdrop-blur-md bg-[#1e1633]/35 border border-white/25`) positioned neatly in the top-left corner (`top-5 left-5`, ~`76–88px` diameter).
   - Displays crisp cardinal ticks (`N`, `E`, `S`, `W` with subtle gold accent on `N`) rotating smoothly in sync with the camera/player yaw, a refined central directional arrow, and a tiny glowing cyan diamond blip indicating the direction toward the Ancient Ruins crystal landmark.
2. **Subtle Bottom Stamina Arc**
   - Positioned cleanly near the lower center (or subtly beside lower-center screen space) as a sleek SVG curved arc (`stroke-linecap="round"`).
   - **Auto-Fade Behavior**:
     - Completely invisible (`opacity-0`) when stamina is full (`100%`) and not sprinting, keeping the viewport uncluttered.
     - Smoothly fades in (`opacity-100`) while sprinting (`Shift`) or regenerating stamina.
     - Shifts color gracefully from luminous emerald-gold (`#9ef06b` / `#ffe066`) to warm amber-coral (`#ff7b6b`) when stamina dips below `25%`.
3. **Screenshot / Clean View Mode (`H` Key Toggle)**
   - Pressing `H` on the keyboard smoothly fades out the entire HUD overlay (mini-compass, stamina arc, and Task 20 World Mood panel) so users can capture pure, frameless anime landscape screenshots.
   - Pressing `H` again restores the HUD smoothly.
   - Provide a tiny subtle, unobtrusive keybind whisper or accessible button (`aria-label="Toggle HUD visibility"` / `H`) that hides cleanly when HUD is toggled off.
4. **React / Engine Decoupling**
   - Never trigger React re-renders at 60Hz when values haven't visually changed: either update SVG transform/stroke-dashoffset via refs driven from a lightweight HUD tick or throttle React state cleanly so WebGL frame pacing stays locked at 60 FPS and the `WorldEngine` canvas never remounts.
   - Keep HUD pointer-events `pointer-events-none` on the container (with `pointer-events-auto` only on interactive buttons/panels) so mouse dragging anywhere on the screen seamlessly orbits the camera.

## Module Boundaries
- Keep visual HUD markup cleanly isolated in `src/components/WorldHud.tsx` and wire it inside `src/App.tsx` via engine callbacks/refs.

## Acceptance Criteria
- Top-left circular mini-compass accurately rotates with camera orientation and points toward North and the ruins landmark.
- Stamina arc appears smoothly only while sprinting or recharging and disappears when full.
- Pressing `H` hides and restores all UI cleanly for pure screenshots.
- HUD never blocks mouse-drag camera orbiting or causes WebGL stutter/remounts.
