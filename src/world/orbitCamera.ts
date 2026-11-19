import * as THREE from 'three';

export interface OrbitCameraBounds {
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
  minGroundClearance: number;
}

export interface OrbitCameraState {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  distance: number;
  targetYaw: number;
  targetPitch: number;
  targetDistance: number;
}

export interface OrbitCameraOptions {
  target?: THREE.Vector3;
  initialYaw?: number;
  initialPitch?: number;
  initialDistance?: number;
  bounds?: Partial<OrbitCameraBounds>;
  rotateSpeed?: number;
  zoomSpeed?: number;
  dampingLambda?: number;
  getGroundHeight?: (x: number, z: number) => number;
  onFirstInteract?: () => void;
}

export interface OrbitCameraController {
  readonly state: OrbitCameraState;
  setView: (yaw: number, pitch: number, distance?: number, immediate?: boolean) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

export const DEFAULT_ORBIT_BOUNDS: Readonly<OrbitCameraBounds> = {
  minPitch: 0.1, // ~5.7 deg above horizon
  maxPitch: 1.15, // ~66 deg overhead bird's-eye
  minDistance: 16,
  maxDistance: 108,
  minGroundClearance: 2.5,
};

export function clampOrbitAngles(
  pitch: number,
  distance: number,
  bounds: OrbitCameraBounds = DEFAULT_ORBIT_BOUNDS,
): { pitch: number; distance: number } {
  return {
    pitch: THREE.MathUtils.clamp(pitch, bounds.minPitch, bounds.maxPitch),
    distance: THREE.MathUtils.clamp(distance, bounds.minDistance, bounds.maxDistance),
  };
}

export function computeOrbitCameraPosition(
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  distance: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  return out.set(
    target.x + distance * cosPitch * sinYaw,
    target.y + distance * sinPitch,
    target.z + distance * cosPitch * cosYaw,
  );
}

export function stepOrbitCamera(
  state: OrbitCameraState,
  dt: number,
  bounds: OrbitCameraBounds = DEFAULT_ORBIT_BOUNDS,
  lambda = 10,
  getGroundHeight?: (x: number, z: number) => number,
  outPos = new THREE.Vector3(),
): THREE.Vector3 {
  const clampedTarget = clampOrbitAngles(
    state.targetPitch,
    state.targetDistance,
    bounds,
  );
  state.targetPitch = clampedTarget.pitch;
  state.targetDistance = clampedTarget.distance;

  const t = dt > 0 ? 1 - Math.exp(-lambda * Math.min(dt, 0.1)) : 1;
  state.yaw += (state.targetYaw - state.yaw) * t;
  state.pitch += (state.targetPitch - state.pitch) * t;
  state.distance += (state.targetDistance - state.distance) * t;

  computeOrbitCameraPosition(
    state.target,
    state.yaw,
    state.pitch,
    state.distance,
    outPos,
  );

  if (getGroundHeight) {
    const minAllowedY = getGroundHeight(outPos.x, outPos.z) + bounds.minGroundClearance;
    if (outPos.y < minAllowedY) {
      outPos.y = minAllowedY;
    }
  }

  return outPos;
}

/**
 * Attaches a simple, responsive touch + mouse 360-degree orbit camera controller
 * to `domElement` so dragging anywhere on mobile or desktop smoothly rotates around
 * the entire valley, and pinching or scrolling zooms smoothly.
 */
export function createOrbitCameraController(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  options: OrbitCameraOptions = {},
): OrbitCameraController {
  const bounds: OrbitCameraBounds = {
    ...DEFAULT_ORBIT_BOUNDS,
    ...options.bounds,
  };
  const rotateSpeed = options.rotateSpeed ?? 0.0065;
  const zoomSpeed = options.zoomSpeed ?? 0.0018;
  const dampingLambda = options.dampingLambda ?? 11;

  const initialClamped = clampOrbitAngles(
    options.initialPitch ?? 0.34,
    options.initialDistance ?? 58,
    bounds,
  );
  const initialYaw = options.initialYaw ?? -0.68;

  const state: OrbitCameraState = {
    target: (options.target ?? new THREE.Vector3(4, 3.5, -4)).clone(),
    yaw: initialYaw,
    pitch: initialClamped.pitch,
    distance: initialClamped.distance,
    targetYaw: initialYaw,
    targetPitch: initialClamped.pitch,
    targetDistance: initialClamped.distance,
  };

  const activePointers = new Map<number, { x: number; y: number }>();
  let lastPinchDist: number | null = null;
  let interacted = false;

  const notifyInteracted = () => {
    if (!interacted) {
      interacted = true;
      options.onFirstInteract?.();
    }
  };

  const getPinchDistance = (): number | null => {
    if (activePointers.size !== 2) return null;
    const pts = Array.from(activePointers.values());
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      domElement.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer events in automated browsers
    }
    if (activePointers.size === 2) {
      lastPinchDist = getPinchDistance();
    } else {
      lastPinchDist = null;
    }
    notifyInteracted();
  };

  const onPointerMove = (e: PointerEvent): void => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (activePointers.size === 1) {
      // Dragging left/right orbits smoothly 360 degrees around the valley
      state.targetYaw -= dx * rotateSpeed;
      state.targetPitch = THREE.MathUtils.clamp(
        state.targetPitch + dy * rotateSpeed * 0.85,
        bounds.minPitch,
        bounds.maxPitch,
      );
      notifyInteracted();
    } else if (activePointers.size === 2) {
      const pinchDist = getPinchDistance();
      if (pinchDist !== null && lastPinchDist !== null && lastPinchDist > 1) {
        const scale = lastPinchDist / Math.max(1, pinchDist);
        state.targetDistance = THREE.MathUtils.clamp(
          state.targetDistance * scale,
          bounds.minDistance,
          bounds.maxDistance,
        );
      }
      lastPinchDist = pinchDist;
      notifyInteracted();
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      lastPinchDist = null;
    }
    try {
      if (domElement.hasPointerCapture(e.pointerId)) {
        domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore synthetic pointer events
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = 1 + e.deltaY * zoomSpeed;
    state.targetDistance = THREE.MathUtils.clamp(
      state.targetDistance * factor,
      bounds.minDistance,
      bounds.maxDistance,
    );
    notifyInteracted();
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });

  const scratchPos = new THREE.Vector3();

  const applyCamera = (dt: number): void => {
    stepOrbitCamera(
      state,
      dt,
      bounds,
      dampingLambda,
      options.getGroundHeight,
      scratchPos,
    );
    camera.position.copy(scratchPos);
    camera.lookAt(state.target);
  };

  // Snap immediately on init so first frame matches initial state
  applyCamera(0);

  const setView = (
    yaw: number,
    pitch: number,
    distance?: number,
    immediate = false,
  ): void => {
    const clamped = clampOrbitAngles(
      pitch,
      distance ?? state.targetDistance,
      bounds,
    );
    state.targetYaw = yaw;
    state.targetPitch = clamped.pitch;
    state.targetDistance = clamped.distance;
    if (immediate) {
      state.yaw = yaw;
      state.pitch = clamped.pitch;
      state.distance = clamped.distance;
      applyCamera(0);
    }
  };

  const dispose = (): void => {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerUp);
    domElement.removeEventListener('wheel', onWheel);
    activePointers.clear();
  };

  return {
    state,
    setView,
    update: (dt: number) => applyCamera(dt),
    dispose,
  };
}
