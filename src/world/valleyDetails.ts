import * as THREE from 'three';
import {
  WATER_LEVEL,
  getBridgeAnchor,
  getOverlookCenter,
  getRiverCenterX,
  getRiverHalfWidth,
  getRuinsCenter,
  getTerrainHeight,
} from './terrain';
import {
  addInkOutline,
  addInkOutlineToGroup,
  createAnimeToonMaterial,
} from './toonMaterials';
import type { WaterController } from './water';

export interface ValleyDetailsStats {
  lanterns: number;
  landmarks: number;
}

export interface ValleyDetailsController {
  readonly root: THREE.Group;
  readonly stats: ValleyDetailsStats;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Hero Composite Landmarks & Structures (Grass/Flowers/Trees/Clouds live in
// dedicated modules: grass.ts, trees.ts, rocks.ts, and atmosphere.ts)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hero Composite Landmarks & Structures
// ---------------------------------------------------------------------------

function buildWoodenBridge(
  parent: THREE.Group,
  water?: WaterController,
): void {
  const anchor = getBridgeAnchor();
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'curvedWoodenBridge';
  bridgeGroup.position.copy(anchor.position);
  bridgeGroup.rotation.y = anchor.rotationY;

  const plankLightMat = createAnimeToonMaterial('#c28554', { steps: 3, rimIntensity: 0.2 });
  const plankDarkMat = createAnimeToonMaterial('#a66c40', { steps: 3, rimIntensity: 0.2 });
  const beamMat = createAnimeToonMaterial('#7c4e30', { steps: 3, rimIntensity: 0.15 });
  const ropeMat = createAnimeToonMaterial('#e5d6b0', { steps: 2, rimIntensity: 0.15 });
  const stoneMat = createAnimeToonMaterial('#9ba6ca', { steps: 2, flatShading: true, rimIntensity: 0.2 });

  const span = anchor.span;
  const halfSpan = span * 0.5;
  const deckWidth = 3.5;
  const archHeight = 1.45;
  const archAt = (x: number): number => {
    const u = x / halfSpan;
    return archHeight * Math.max(0, 1 - u * u);
  };

  // Stone abutment blocks anchored firmly into both banks
  const abutGeo = new THREE.BoxGeometry(2.1, 2.4, deckWidth + 0.9);
  for (const side of [-1, 1]) {
    const abut = new THREE.Mesh(abutGeo, stoneMat);
    abut.position.set(side * (halfSpan + 0.45), -0.95, 0);
    abut.castShadow = true;
    abut.receiveShadow = true;
    bridgeGroup.add(abut);
  }

  // Two curved timber stringer beams beneath the planks
  for (const sideZ of [-deckWidth * 0.36, deckWidth * 0.36]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i += 1) {
      const lx = -halfSpan + (i / 10) * span;
      pts.push(new THREE.Vector3(lx, archAt(lx) - 0.16, sideZ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const beamGeo = new THREE.TubeGeometry(curve, 18, 0.18, 6, false);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.castShadow = true;
    beam.receiveShadow = true;
    bridgeGroup.add(beam);
  }

  // Individual chamfered wooden planks along the parabolic arch
  const plankCount = 17;
  const plankGeo = new THREE.BoxGeometry(0.72, 0.14, deckWidth);
  for (let i = 0; i < plankCount; i += 1) {
    const t = (i + 0.5) / plankCount;
    const lx = -halfSpan + t * span;
    const ly = archAt(lx);
    const dyDx = (-2 * archHeight * lx) / (halfSpan * halfSpan);
    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? plankLightMat : plankDarkMat);
    plank.position.set(lx, ly, (i % 3 === 0 ? 0.03 : -0.02));
    plank.rotation.z = Math.atan(dyDx);
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);
  }

  // Vertical timber posts & sagging catenary hemp rope railings
  const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.38, 6);
  const capGeo = new THREE.BoxGeometry(0.28, 0.12, 0.28);
  const postPositions = [-halfSpan + 0.3, -halfSpan * 0.5, 0, halfSpan * 0.5, halfSpan - 0.3];

  for (const sideZ of [-deckWidth * 0.48, deckWidth * 0.48]) {
    for (let i = 0; i < postPositions.length; i += 1) {
      const px = postPositions[i];
      const py = archAt(px);
      const post = new THREE.Mesh(postGeo, beamMat);
      post.position.set(px, py + 0.56, sideZ);
      post.castShadow = true;
      bridgeGroup.add(post);

      const cap = new THREE.Mesh(capGeo, plankLightMat);
      cap.position.set(px, py + 1.28, sideZ);
      bridgeGroup.add(cap);

      if (i < postPositions.length - 1) {
        const nx = postPositions[i + 1];
        const ny = archAt(nx);
        const mx = (px + nx) * 0.5;
        const my = (py + ny) * 0.5 - 0.22;
        const ropeCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, py + 1.05, sideZ),
          new THREE.Vector3(mx, my + 1.05, sideZ),
          new THREE.Vector3(nx, ny + 1.05, sideZ),
        ]);
        const ropeGeo = new THREE.TubeGeometry(ropeCurve, 10, 0.045, 5, false);
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        bridgeGroup.add(rope);
      }
    }
  }

  addInkOutlineToGroup(bridgeGroup, 0.026, '#1e1633');
  parent.add(bridgeGroup);

  // Register subtle foam disturbance near bridge piers in the river
  if (water) {
    const dirX = Math.cos(anchor.rotationY);
    const dirZ = -Math.sin(anchor.rotationY);
    water.registerFoamObstacle(
      anchor.position.x - dirX * (halfSpan - 1.2),
      anchor.position.z - dirZ * (halfSpan - 1.2),
      1.1,
    );
    water.registerFoamObstacle(
      anchor.position.x + dirX * (halfSpan - 1.2),
      anchor.position.z + dirZ * (halfSpan - 1.2),
      1.1,
    );
  }
}

function buildSteppingStones(parent: THREE.Group, water?: WaterController): void {
  const group = new THREE.Group();
  group.name = 'riverSteppingStones';
  const stoneMat = createAnimeToonMaterial('#a7b1cf', { steps: 2, flatShading: true });
  const zBase = 2.0;
  const cx = getRiverCenterX(zBase);
  const hw = getRiverHalfWidth(zBase);

  const count = 6;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const x = cx - hw * 0.78 + t * hw * 1.56;
    const z = zBase + Math.sin(t * Math.PI * 2) * 1.25;
    const r = 0.72 + (i % 2) * 0.16;
    const geo = new THREE.CylinderGeometry(r * 0.92, r * 1.08, 0.65, 7);
    const stone = new THREE.Mesh(geo, stoneMat);
    stone.position.set(x, WATER_LEVEL - 0.14, z);
    stone.rotation.y = i * 0.85;
    stone.receiveShadow = true;
    stone.castShadow = true;
    addInkOutline(stone, 0.026, '#1e1633');
    group.add(stone);

    water?.registerFoamObstacle(x, z, r * 1.05);
  }

  parent.add(group);
}

function buildAncientRuins(parent: THREE.Group): {
  crystal: THREE.Mesh;
  ringOuter: THREE.Mesh;
  ringInner: THREE.Mesh;
  baseY: number;
} {
  const center = getRuinsCenter();
  const ruinsGroup = new THREE.Group();
  ruinsGroup.name = 'ancientRuinsPlaza';
  ruinsGroup.position.copy(center);

  const travertineMat = createAnimeToonMaterial('#e4dfd4', {
    steps: 3,
    gradientStops: [138, 138, 138, 200, 200, 255, 255, 255],
    rimIntensity: 0.25,
  });
  const shadowStoneMat = createAnimeToonMaterial('#aab3ce', {
    steps: 2,
    flatShading: true,
    gradientStops: [142, 255],
    rimIntensity: 0.22,
  });
  const goldMat = createAnimeToonMaterial('#ffd166', {
    steps: 2,
    emissive: '#f4b942',
    emissiveIntensity: 0.55,
    rimColor: '#fffbe6',
    rimIntensity: 0.4,
  });
  const crystalMat = createAnimeToonMaterial('#5ff6ff', {
    steps: 2,
    emissive: '#3df5ff',
    emissiveIntensity: 1.75,
    rimColor: '#ffffff',
    rimIntensity: 0.55,
  });

  // Two-tiered octagonal stone dais grounded below rim so edges never float
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 10.1, 1.3, 12), shadowStoneMat);
  baseRing.position.y = -0.2;
  baseRing.receiveShadow = true;
  baseRing.castShadow = true;
  ruinsGroup.add(baseRing);

  const upperRing = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.55, 12), travertineMat);
  upperRing.position.y = 0.58;
  upperRing.receiveShadow = true;
  upperRing.castShadow = true;
  ruinsGroup.add(upperRing);

  // Inlaid golden compass ring on plaza floor
  const inlayGeo = new THREE.RingGeometry(2.6, 2.95, 24);
  inlayGeo.rotateX(-Math.PI / 2);
  const inlay = new THREE.Mesh(inlayGeo, goldMat);
  inlay.position.y = 0.87;
  inlay.userData.skipInkOutline = true;
  ruinsGroup.add(inlay);

  // Wide stone stairs facing the incoming south-west footpath
  const stairGroup = new THREE.Group();
  stairGroup.rotation.y = Math.PI * 0.24;
  for (let s = 0; s < 4; s += 1) {
    const stepMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.26, 1.1),
      s % 2 === 0 ? travertineMat : shadowStoneMat,
    );
    stepMesh.position.set(0, 0.72 - s * 0.22, 7.6 + s * 0.78);
    stepMesh.receiveShadow = true;
    stepMesh.castShadow = true;
    stairGroup.add(stepMesh);
  }
  ruinsGroup.add(stairGroup);

  // Perimeter weathered columns + intact carved archway lintels
  const pillarCount = 7;
  const pillarRadius = 6.2;
  const intactIndices = new Set([0, 1, 2, 5, 6]);
  const pillarPositions: THREE.Vector3[] = [];

  for (let i = 0; i < pillarCount; i += 1) {
    // Leave an inviting open entry gap facing south-west toward the stairs
    const angle = -Math.PI * 0.82 + (i / (pillarCount - 1)) * Math.PI * 1.48;
    const px = Math.cos(angle) * pillarRadius;
    const pz = Math.sin(angle) * pillarRadius;
    pillarPositions.push(new THREE.Vector3(px, 0.85, pz));

    const intact = intactIndices.has(i);
    const height = intact ? 5.6 : 2.5 + (i % 2) * 1.1;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 1.35), shadowStoneMat);
    plinth.position.set(px, 1.05, pz);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    ruinsGroup.add(plinth);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.56, height, 8),
      travertineMat,
    );
    shaft.position.set(px, 1.2 + height * 0.5, pz);
    if (!intact) {
      shaft.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.08;
    }
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    ruinsGroup.add(shaft);

    if (intact) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.42, 1.42), shadowStoneMat);
      cap.position.set(px, 1.2 + height + 0.15, pz);
      cap.castShadow = true;
      ruinsGroup.add(cap);
    }
  }

  // Span broken stone lintels across intact neighboring columns
  const lintelPairs: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 2],
    [5, 6],
  ];
  for (const [aIdx, bIdx] of lintelPairs) {
    const a = pillarPositions[aIdx];
    const b = pillarPositions[bIdx];
    const dist = a.distanceTo(b);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(dist + 0.9, 0.62, 1.15),
      travertineMat,
    );
    lintel.position.set((a.x + b.x) * 0.5, 7.25, (a.z + b.z) * 0.5);
    lintel.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    ruinsGroup.add(lintel);
  }

  // Fallen column drum resting on the dais edge
  const fallenDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 1.85, 8), travertineMat);
  fallenDrum.position.set(-2.9, 1.32, 3.2);
  fallenDrum.rotation.set(0.12, 0.6, Math.PI * 0.48);
  fallenDrum.castShadow = true;
  fallenDrum.receiveShadow = true;
  ruinsGroup.add(fallenDrum);

  // Central ornate pedestal
  const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.85, 0.85, 8), shadowStoneMat);
  pedBase.position.y = 1.25;
  pedBase.castShadow = true;
  pedBase.receiveShadow = true;
  ruinsGroup.add(pedBase);

  const pedColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 1.25, 8), travertineMat);
  pedColumn.position.y = 2.2;
  pedColumn.castShadow = true;
  ruinsGroup.add(pedColumn);

  addInkOutlineToGroup(ruinsGroup, 0.036, '#1e1633');

  // Floating glowing cyan crystal & orbiting golden astrolabe rings
  const crystalGeo = new THREE.OctahedronGeometry(0.78, 0);
  crystalGeo.scale(0.62, 1.75, 0.62);
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.name = 'ruinsFloatingCrystal';
  const baseY = 4.65;
  crystal.position.set(0, baseY, 0);
  ruinsGroup.add(crystal);

  const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.075, 8, 28), goldMat);
  ringOuter.position.set(0, baseY, 0);
  ringOuter.rotation.set(0.55, 0.2, 0.35);
  ruinsGroup.add(ringOuter);

  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.06, 8, 24), goldMat);
  ringInner.position.set(0, baseY, 0);
  ringInner.rotation.set(-0.65, 0.4, -0.45);
  ruinsGroup.add(ringInner);

  parent.add(ruinsGroup);
  return { crystal, ringOuter, ringInner, baseY };
}

function buildToriiGate(parent: THREE.Group): void {
  const gateX = 24.5;
  const gateZ = -7.0;
  const groundY = getTerrainHeight(gateX, gateZ);

  const torii = new THREE.Group();
  torii.name = 'vermilionToriiGate';
  torii.position.set(gateX, groundY, gateZ);
  // Orient perpendicular to ascending ruins trail (20,4 -> 29,-17)
  torii.rotation.y = Math.atan2(-9.0, 21.0);

  const vermilionMat = createAnimeToonMaterial('#e04f40', { steps: 3, rimIntensity: 0.3 });
  const darkCapMat = createAnimeToonMaterial('#322b49', {
    steps: 2,
    gradientStops: [135, 255],
    rimIntensity: 0.22,
  });
  const plinthMat = createAnimeToonMaterial('#6b7496', { steps: 2, gradientStops: [145, 255] });
  const goldMat = createAnimeToonMaterial('#f4c95d', { steps: 2, emissive: '#e5b241', emissiveIntensity: 0.35 });

  const colGeo = new THREE.CylinderGeometry(0.24, 0.31, 5.4, 8);
  const plinthGeo = new THREE.CylinderGeometry(0.42, 0.5, 0.9, 8);

  for (const side of [-1, 1]) {
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(side * 2.35, 0.25, 0);
    plinth.castShadow = true;
    torii.add(plinth);

    const col = new THREE.Mesh(colGeo, vermilionMat);
    col.position.set(side * 2.25, 2.85, 0);
    col.rotation.z = side * 0.045;
    col.castShadow = true;
    torii.add(col);
  }

  // Secondary tie beam (nuki)
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.34, 0.36), vermilionMat);
  nuki.position.set(0, 4.35, 0);
  nuki.castShadow = true;
  torii.add(nuki);

  // Curved upturned main lintel (kasagi)
  const kasagiCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.65, 5.75, 0),
    new THREE.Vector3(-1.8, 5.42, 0),
    new THREE.Vector3(0, 5.36, 0),
    new THREE.Vector3(1.8, 5.42, 0),
    new THREE.Vector3(3.65, 5.75, 0),
  ]);
  const kasagiLower = new THREE.Mesh(
    new THREE.TubeGeometry(kasagiCurve, 16, 0.24, 6, false),
    vermilionMat,
  );
  kasagiLower.castShadow = true;
  torii.add(kasagiLower);

  const kasagiCapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.85, 6.02, 0),
    new THREE.Vector3(-1.85, 5.66, 0),
    new THREE.Vector3(0, 5.58, 0),
    new THREE.Vector3(1.85, 5.66, 0),
    new THREE.Vector3(3.85, 6.02, 0),
  ]);
  const kasagiCap = new THREE.Mesh(
    new THREE.TubeGeometry(kasagiCapCurve, 16, 0.26, 6, false),
    darkCapMat,
  );
  kasagiCap.scale.set(1, 0.72, 1.35);
  kasagiCap.castShadow = true;
  torii.add(kasagiCap);

  // Decorative central tablet (gakuzuka) with gold trim
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.88, 0.26), darkCapMat);
  tablet.position.set(0, 4.86, 0);
  torii.add(tablet);

  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.3), goldMat);
  trim.position.set(0, 4.86, 0);
  torii.add(trim);

  addInkOutlineToGroup(torii, 0.032, '#1e1633');
  parent.add(torii);
}

function buildScenicOverlookDeck(parent: THREE.Group): void {
  const center = getOverlookCenter();
  const deckGroup = new THREE.Group();
  deckGroup.name = 'scenicOverlookDeck';
  // Position on the east-facing edge of the high overlook crest looking over the valley
  deckGroup.position.set(center.x + 5.2, center.y, center.z + 1.2);
  deckGroup.rotation.y = 0.22;

  const plankMat = createAnimeToonMaterial('#c28554', { steps: 3, rimIntensity: 0.18 });
  const timberMat = createAnimeToonMaterial('#7c4e30', { steps: 3, rimIntensity: 0.15 });
  const ropeMat = createAnimeToonMaterial('#e5d6b0', { steps: 2 });

  // Main timber deck floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.34, 5.4), plankMat);
  floor.position.set(1.2, 0.22, 0);
  floor.castShadow = true;
  floor.receiveShadow = true;
  deckGroup.add(floor);

  // Diagonal cliff support struts extending down into the hillside
  const strutGeo = new THREE.CylinderGeometry(0.16, 0.2, 5.2, 6);
  for (const sz of [-2.1, 0, 2.1]) {
    const strut = new THREE.Mesh(strutGeo, timberMat);
    strut.position.set(3.2, -2.0, sz);
    strut.rotation.z = -0.34;
    strut.castShadow = true;
    deckGroup.add(strut);
  }

  // Perimeter railing posts
  const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.25, 6);
  const railPosts: ReadonlyArray<readonly [number, number]> = [
    [-2.0, -2.5],
    [1.2, -2.5],
    [4.4, -2.5],
    [4.4, 0],
    [4.4, 2.5],
    [1.2, 2.5],
    [-2.0, 2.5],
  ];
  for (const [px, pz] of railPosts) {
    const post = new THREE.Mesh(postGeo, timberMat);
    post.position.set(px, 0.9, pz);
    post.castShadow = true;
    deckGroup.add(post);
  }

  // Top wooden handrails along the 3 viewing sides
  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 5.15), plankMat);
  frontRail.position.set(4.4, 1.48, 0);
  deckGroup.add(frontRail);

  for (const sz of [-2.5, 2.5]) {
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(6.55, 0.14, 0.16), plankMat);
    sideRail.position.set(1.2, 1.48, sz);
    deckGroup.add(sideRail);

    const midRope = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 0.08), ropeMat);
    midRope.position.set(1.2, 0.92, sz);
    deckGroup.add(midRope);
  }

  // Cozy wooden viewing bench
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 2.2), plankMat);
  seat.position.set(1.8, 0.72, -0.2);
  seat.castShadow = true;
  deckGroup.add(seat);

  for (const bz of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.44, 0.16), timberMat);
    leg.position.set(1.8, 0.48, -0.2 + bz);
    deckGroup.add(leg);
  }

  addInkOutlineToGroup(deckGroup, 0.028, '#1e1633');
  parent.add(deckGroup);
}

function buildPathwayLanterns(parent: THREE.Group): {
  lanternMats: THREE.MeshToonMaterial[];
  count: number;
} {
  const stoneMat = createAnimeToonMaterial('#b7c0da', {
    steps: 2,
    gradientStops: [148, 255],
    flatShading: true,
  });
  const roofMat = createAnimeToonMaterial('#7f8bb2', {
    steps: 2,
    gradientStops: [142, 255],
    flatShading: true,
  });

  const lanternCoords: ReadonlyArray<readonly [number, number]> = [
    [-19.5, 31.8],
    [-11.8, 25.5],
    [-8.6, 17.6],
    [9.4, 16.5],
    [15.8, 9.5],
    [22.0, -3.5],
    [27.2, -10.5],
    [32.2, -21.5],
    [35.2, -28.0],
    [-25.2, 12.2],
    [-35.0, -14.5],
    [-47.5, -26.5],
  ];

  const lanternMats: THREE.MeshToonMaterial[] = [];

  for (let i = 0; i < lanternCoords.length; i += 1) {
    const [lx, lz] = lanternCoords[i];
    const ly = getTerrainHeight(lx, lz);
    const lantern = new THREE.Group();
    lantern.name = `stoneLantern_${i}`;
    lantern.position.set(lx, ly - 0.08, lz);
    lantern.rotation.y = i * 0.7;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.28, 6), stoneMat);
    base.position.y = 0.14;
    lantern.add(base);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.95, 6), stoneMat);
    shaft.position.y = 0.72;
    shaft.castShadow = true;
    lantern.add(shaft);

    const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.16, 6), stoneMat);
    shelf.position.y = 1.24;
    lantern.add(shelf);

    // Warm golden emissive lantern core (triggers soft selective bloom)
    const coreMat = createAnimeToonMaterial('#ffcf70', {
      steps: 2,
      emissive: '#ffbe55',
      emissiveIntensity: 1.6,
      rimColor: '#fffbe6',
      rimIntensity: 0.35,
    });
    lanternMats.push(coreMat);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.38, 6), coreMat);
    core.position.y = 1.5;
    lantern.add(core);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.54, 0.38, 6), roofMat);
    roof.position.y = 1.88;
    roof.castShadow = true;
    lantern.add(roof);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), roofMat);
    finial.position.y = 2.1;
    lantern.add(finial);

    addInkOutlineToGroup(lantern, 0.022, '#1e1633');
    parent.add(lantern);
  }

  return { lanternMats, count: lanternCoords.length };
}

// ---------------------------------------------------------------------------
// Main Valley Details Assembler
// ---------------------------------------------------------------------------

/**
 * Populates Azure Vale with sculpted cliff rock outcrops, riverbank boulders,
 * arched wooden bridge, stepping-stones, fluffy anime trees, swaying grass tufts,
 * pastel wildflowers, berry bushes, ancient ruins landmark, Torii gate,
 * stone lanterns, scenic overlook deck, and drifting clouds.
 */
export function createValleyDetails(
  scene: THREE.Scene,
  water?: WaterController,
): ValleyDetailsController {
  const root = new THREE.Group();
  root.name = 'valleyWorldDetails';
  scene.add(root);

  // Hero Structures & Landmarks
  buildWoodenBridge(root, water);
  buildSteppingStones(root, water);
  const ruinsRefs = buildAncientRuins(root);
  buildToriiGate(root);
  buildScenicOverlookDeck(root);
  const lanternInfo = buildPathwayLanterns(root);

  const update = (dt: number, elapsed: number): void => {
    // Levitate & rotate the ancient ruins crystal + astrolabe rings
    ruinsRefs.crystal.position.y = ruinsRefs.baseY + Math.sin(elapsed * 1.9) * 0.26;
    ruinsRefs.crystal.rotation.y += dt * 0.85;
    ruinsRefs.ringOuter.position.y = ruinsRefs.crystal.position.y;
    ruinsRefs.ringInner.position.y = ruinsRefs.crystal.position.y;
    ruinsRefs.ringOuter.rotation.z += dt * 0.55;
    ruinsRefs.ringOuter.rotation.y += dt * 0.35;
    ruinsRefs.ringInner.rotation.x -= dt * 0.75;
    ruinsRefs.ringInner.rotation.y -= dt * 0.45;

    // Gentle warm lantern breathing glow
    for (let i = 0; i < lanternInfo.lanternMats.length; i += 1) {
      lanternInfo.lanternMats[i].emissiveIntensity =
        1.55 + Math.sin(elapsed * 2.4 + i * 1.3) * 0.16;
    }
  };

  const dispose = (): void => {
    scene.remove(root);
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && !disposedMats.has(m)) {
            disposedMats.add(m);
            m.dispose();
          }
        }
      }
    });
  };

  return {
    root,
    stats: {
      lanterns: lanternInfo.count,
      landmarks: 5,
    },
    update,
    dispose,
  };
}
