import * as THREE from 'three';
import {
  FIXED_STEP,
  MAX_FRAME_DELTA,
  MAX_SUB_STEPS,
  advanceFixedLoop,
  createFixedLoopState,
  type FixedLoopState,
} from './fixedLoop';

export interface WorldSystem {
  name?: string;
  fixedUpdate?: (dt: number, elapsed: number) => void;
  update?: (dt: number, elapsed: number, alpha: number) => void;
  resize?: (width: number, height: number) => void;
  dispose?: () => void;
}

export interface RenderPipeline {
  render: () => void;
  resize?: (width: number, height: number) => void;
  dispose?: () => void;
}

export interface WorldEngineOptions {
  container: HTMLElement;
  clearColor?: THREE.ColorRepresentation;
  exposure?: number;
  forceShadows?: boolean;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererParam = debugExt
      ? debugExt.UNMASKED_RENDERER_WEBGL
      : gl.RENDERER;
    const gpuInfo = String(gl.getParameter(rendererParam) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuInfo);
  } catch {
    return false;
  }
}

export class WorldEngine {
  public readonly container: HTMLElement;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly isSoftwareGl: boolean;

  private readonly systems: WorldSystem[] = [];
  private renderPipeline: RenderPipeline | null = null;
  private readonly loopState: FixedLoopState = createFixedLoopState();

  private running = false;
  private disposed = false;
  private rafId: number | null = null;
  private timerId: number | null = null;
  private lastTimestamp = 0;

  private readonly handleResizeBound: () => void;
  private readonly handleVisibilityBound: () => void;

  constructor(options: WorldEngineOptions) {
    this.container = options.container;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(options.clearColor ?? '#4ea8de');

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.2, 600);
    this.camera.position.set(0, 6, 16);
    this.camera.lookAt(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.exposure ?? 1.05;
    this.renderer.shadowMap.enabled = options.forceShadows ?? true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.dataset.worldCanvas = 'true';
    this.container.appendChild(canvas);

    this.handleResizeBound = () => this.resize();
    this.handleVisibilityBound = () => {
      if (!document.hidden) {
        this.lastTimestamp = performance.now();
      }
    };

    window.addEventListener('resize', this.handleResizeBound);
    document.addEventListener('visibilitychange', this.handleVisibilityBound);
  }

  public get elapsed(): number {
    return this.loopState.elapsed;
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public registerSystem(system: WorldSystem): void {
    if (this.systems.includes(system)) return;
    this.systems.push(system);
  }

  public unregisterSystem(system: WorldSystem): void {
    const idx = this.systems.indexOf(system);
    if (idx !== -1) {
      this.systems.splice(idx, 1);
    }
  }

  public setRenderPipeline(pipeline: RenderPipeline | null): void {
    this.renderPipeline = pipeline;
    if (pipeline?.resize) {
      const width = Math.max(1, this.container.clientWidth || window.innerWidth);
      const height = Math.max(1, this.container.clientHeight || window.innerHeight);
      pipeline.resize(width, height);
    }
  }

  public start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTimestamp = performance.now();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    this.renderPipeline?.resize?.(width, height);
    for (let i = 0; i < this.systems.length; i += 1) {
      this.systems[i].resize?.(width, height);
    }
  }

  private scheduleNextFrame(): void {
    if (!this.running || this.disposed) return;
    this.rafId = requestAnimationFrame((now) => {
      this.rafId = null;
      this.tick(now);
    });
  }

  private afterSoftwareDraw(next: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.timerId = window.setTimeout(next, 80);
      return;
    }

    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();

    const poll = () => {
      if (!this.running || this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.timerId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.timerId = window.setTimeout(next, 80);
      }
    };

    this.timerId = window.setTimeout(poll, 5);
  }

  private tick(now: number): void {
    if (!this.running || this.disposed) return;

    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    const { clampedDt, alpha } = advanceFixedLoop(
      this.loopState,
      rawDt,
      (fixedDt, fixedElapsed) => {
        for (let i = 0; i < this.systems.length; i += 1) {
          this.systems[i].fixedUpdate?.(fixedDt, fixedElapsed);
        }
      },
      {
        fixedStep: FIXED_STEP,
        maxFrameDelta: MAX_FRAME_DELTA,
        maxSubSteps: MAX_SUB_STEPS,
      },
    );

    for (let i = 0; i < this.systems.length; i += 1) {
      this.systems[i].update?.(clampedDt, this.loopState.elapsed, alpha);
    }

    if (this.renderPipeline) {
      this.renderPipeline.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterSoftwareDraw(() => this.scheduleNextFrame());
    } else {
      this.scheduleNextFrame();
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;

    window.removeEventListener('resize', this.handleResizeBound);
    document.removeEventListener('visibilitychange', this.handleVisibilityBound);

    for (let i = this.systems.length - 1; i >= 0; i -= 1) {
      this.systems[i].dispose?.();
    }
    this.systems.length = 0;

    this.renderPipeline?.dispose?.();
    this.renderPipeline = null;

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.scene.clear();

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
