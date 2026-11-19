/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { WorldEngine } from './world/WorldEngine';
import { createAtmosphere } from './world/atmosphere';
import { createGrass } from './world/grass';
import { createOrbitCameraController } from './world/orbitCamera';
import { createPostProcessing } from './world/postProcessing';
import { createRocks } from './world/rocks';
import {
  createTerrain,
  getOverlookCenter,
  getRuinsCenter,
  getTerrainHeight,
} from './world/terrain';
import { disposeToonGradientMaps } from './world/toonMaterials';
import { createTrees } from './world/trees';
import { createValleyDetails } from './world/valleyDetails';
import { createWater } from './world/water';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const searchParams = new URLSearchParams(window.location.search);
    const forceShadows = searchParams.get('shadows') === '1';
    const forceComposer = searchParams.get('composer') === '1';
    const viewPreset = searchParams.get('view') ?? 'default';

    const engine = new WorldEngine({
      container,
      forceShadows: forceShadows ? true : undefined,
    });
    engineRef.current = engine;

    // Task 04 Sky & Atmosphere rig (sky dome, FogExp2, golden sun, HemisphereLight)
    const atmosphere = createAtmosphere(engine.scene, {
      isSoftwareGl: engine.isSoftwareGl,
      castShadow: true,
    });
    // Expand the sun shadow frustum across the entire playable valley (bridge, Torii, ruins, overlook, trees)
    const shadowMapRes = engine.isSoftwareGl ? 1024 : 2048;
    atmosphere.sunLight.shadow.mapSize.set(shadowMapRes, shadowMapRes);
    atmosphere.sunLight.shadow.bias = -0.0004;
    atmosphere.sunLight.shadow.normalBias = 0.08;
    atmosphere.sunLight.shadow.radius = 2.0;
    atmosphere.setShadowCenter(6, -6, 92);

    // Task 05 Post-Processing pipeline (EffectComposer, high-threshold UnrealBloomPass, SMAA, OutputPass)
    const postProcessing = createPostProcessing(
      engine.renderer,
      engine.scene,
      engine.camera,
      {
        isSoftwareGl: engine.isSoftwareGl,
        bypassComposer: engine.isSoftwareGl && !forceComposer,
      },
    );
    engine.setRenderPipeline(postProcessing);

    // Task 06 Rolling Stylized Valley Terrain (with smooth lifted cliff normals & 2048x2048 biome texture)
    const terrain = createTerrain(engine.scene, {
      maxAnisotropy: engine.renderer.capabilities.getMaxAnisotropy(),
    });

    // Stylized cel-shaded turquoise river & tranquil pond with shoreline foam
    const water = createWater(engine.scene, atmosphere.getSunDirection());

    // Procedural world landmarks & vegetation (bridge piers & stepping-stones register foam first)
    const details = createValleyDetails(engine.scene, water);

    // High-density anime meadow grass (64,500+ blades) + dense lavender, pink & golden wildflowers
    const grass = createGrass(engine.scene);

    // Task 09 Stylized Cliffs & Sculpted Boulders (4 beveled archetypes, 2-tone cel shading,
    // watertight plum-ink outlines, grass caps, colliders, and foreground river foam obstacles)
    const rocks = createRocks(engine.scene, water);

    // Soft pillowy painterly anime trees (400+ overlapping botanical cards, warm sun rim-glow, ridge groves)
    const trees = createTrees(engine.scene, {
      sunDirection: atmosphere.getSunDirection(),
    });

    const ruins = getRuinsCenter();
    const overlook = getOverlookCenter();

    // Smooth touch + mouse 360-degree orbit camera so mobile & desktop users can inspect the entire valley
    const orbitCamera = createOrbitCameraController(engine.camera, container, {
      target: new THREE.Vector3(6, 4.0, -4),
      initialYaw: -0.62,
      initialPitch: 0.31,
      initialDistance: 56,
      getGroundHeight: getTerrainHeight,
      onFirstInteract: () => {
        container.dataset.cameraInteracted = 'true';
        setHasInteracted(true);
      },
    });

    if (viewPreset === 'overview') {
      orbitCamera.setView(-0.18, 0.56, 92, true);
    } else if (viewPreset === 'ruins') {
      orbitCamera.state.target.copy(ruins);
      orbitCamera.setView(-0.75, 0.3, 30, true);
    } else if (viewPreset === 'overlook') {
      orbitCamera.state.target.copy(overlook);
      orbitCamera.setView(1.05, 0.25, 28, true);
    } else if (viewPreset === 'pond') {
      orbitCamera.state.target.set(-6, 0.5, -14);
      orbitCamera.setView(-0.8, 0.38, 36, true);
    } else if (viewPreset === 'cliffs') {
      orbitCamera.state.target.set(34, 8, -32);
      orbitCamera.setView(-1.15, 0.22, 34, true);
    } else if (viewPreset === 'trees') {
      // Eye-level showcase framing the hero meadow trio: deep teal-emerald, pastel sakura pink, warm golden-amber
      orbitCamera.state.target.set(22.2, 4.4, 15.2);
      orbitCamera.setView(0.14, 0.08, 17.5, true);
    }

    engine.registerSystem({
      name: 'world-atmosphere-and-terrain',
      update: (dt, elapsed) => {
        orbitCamera.update(dt);
        water.update(dt, elapsed);
        grass.update(dt, elapsed);
        trees.update(dt, elapsed);
        details.update(dt, elapsed);
        atmosphere.update(dt, elapsed, engine.camera.position);
      },
      dispose: () => {
        orbitCamera.dispose();
        trees.dispose();
        grass.dispose();
        rocks.dispose();
        details.dispose();
        water.dispose();
        terrain.dispose();
        atmosphere.dispose();
        disposeToonGradientMaps();
      },
    });

    engine.start();
    container.dataset.engineReady = 'true';
    container.dataset.postProcessingAa = postProcessing.aaMode;

    return () => {
      delete container.dataset.engineReady;
      delete container.dataset.postProcessingAa;
      delete container.dataset.cameraInteracted;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden select-none touch-none bg-[#2d9cff]">
      <div
        ref={canvasMountRef}
        data-testid="world-canvas-container"
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
      />
      <div
        aria-hidden={hasInteracted}
        className={`pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-[#1e1633]/75 px-4 py-2 text-xs font-medium tracking-wide text-[#f7f4eb] shadow-md transition-opacity duration-500 ${
          hasInteracted ? 'opacity-0' : 'opacity-100'
        }`}
      >
        Drag anywhere to rotate view &bull; Pinch or scroll to zoom
      </div>
    </main>
  );
}
