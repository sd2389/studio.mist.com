import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { DenoiseMaterial } from "three-gpu-pathtracer";
import { WebGLPathTracer } from "three-gpu-pathtracer";

/**
 * Relative refractive index per wavelength band. `three-gpu-pathtracer` has no spectral
 * support, so fire is produced by tracing the scene three times at slightly different
 * refractive indices — the same physical cause as real dispersion (IOR varies with
 * wavelength) — and recombining the results into R, G and B.
 */
const BANDS = [-0.5, 0, 0.5] as const;

/** Diamond runs ~2.407 (red) to ~2.451 (violet); ~0.044 of spread. */
export const DIAMOND_IOR_SPREAD = 0.044;

export type SpectralPathTracerOptions = {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Material whose `ior` is retuned per band. Must be the one used by the traced mesh. */
  material: THREE.MeshPhysicalMaterial;
  iorSpread?: number;
  /** Fraction of canvas resolution to accumulate at. Fire is large-scale facet colour,
   *  so it survives well below 1 and converges far faster. */
  renderScale?: number;
};

/**
 * Progressive three-band path tracer for gemstones.
 *
 * Bands are captured in rotation and each capture overwrites the last, so a fixed sample
 * threshold would pin quality at its starting value forever. The threshold doubles every
 * completed cycle instead: the first composite lands in a second or two, and the image
 * keeps converging for as long as the camera stays still.
 */
export class SpectralPathTracer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly tracer: WebGLPathTracer;
  private readonly material: THREE.MeshPhysicalMaterial;
  private readonly baseIor: number;
  private readonly iorSpread: number;
  private readonly bandTargets: THREE.WebGLRenderTarget[];
  private readonly denoiseMaterial: DenoiseMaterial;
  private readonly denoiseQuad: FullScreenQuad;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly compositeQuad: FullScreenQuad;

  private band = 0;
  private cycles = 0;

  constructor(options: SpectralPathTracerOptions) {
    const { canvas, scene, camera, material } = options;
    this.material = material;
    this.baseIor = material.ior;
    this.iorSpread = options.iorSpread ?? DIAMOND_IOR_SPREAD;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.tracer = new WebGLPathTracer(this.renderer);
    this.tracer.bounces = 8;
    this.tracer.transmissiveBounces = 14; // internal bounces are what read as brilliance
    this.tracer.renderScale = options.renderScale ?? 0.85;
    this.tracer.filterGlossyFactor = 0.5;
    this.tracer.renderToCanvas = false; // the composite owns the canvas

    const makeTarget = () =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.FloatType,
        colorSpace: THREE.NoColorSpace,
      });
    this.bandTargets = [makeTarget(), makeTarget(), makeTarget()];

    // Each band is one coherent noisy render (same accumulation, no cross-channel
    // mixing yet) — ordinary path-trace grain a bilateral filter is built for. Denoising
    // was tried on the *composite* first (see below) and failed because three
    // independently-noisy bands mixed into one RGB pixel produce uncorrelated chromatic
    // speckle with no stable edge for the filter to find. Denoising each band on its own,
    // before that mixing happens, is the same tool aimed at the problem it actually solves.
    this.denoiseMaterial = new DenoiseMaterial();
    this.denoiseMaterial.sigma = 5;
    this.denoiseMaterial.kSigma = 1.5;
    this.denoiseMaterial.threshold = 0.05;
    this.denoiseQuad = new FullScreenQuad(this.denoiseMaterial);

    this.compositeMaterial = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { tR: { value: null }, tG: { value: null }, tB: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tR; uniform sampler2D tG; uniform sampler2D tB;
        void main() {
          vec4 r = texture2D(tR, vUv);
          vec4 g = texture2D(tG, vUv);
          vec4 b = texture2D(tB, vUv);

          // Taking only .r from the red band, .g from green, .b from blue (the original
          // approach) means every output channel is built from one band's sample count —
          // a 3x undersampling versus using all the data every band actually accumulated.
          // Averaging all three bands' full RGB gives a shared base with the combined
          // sample count of all three; the per-band deviation from that average is the
          // actual dispersion signal (small by nature — real fire is a subtle effect),
          // added back on top. Noise in the fringe term is far less visible riding on an
          // already-clean base than it is as the sole source of a channel's value.
          vec3 base = (r.rgb + g.rgb + b.rgb) / 3.0;
          vec3 fringe = vec3(r.r - base.r, g.g - base.g, b.b - base.b);
          gl_FragColor = vec4(base + fringe, max(max(r.a, g.a), b.a));
        }`,
    });
    this.compositeQuad = new FullScreenQuad(this.compositeMaterial);

    // Tried three-gpu-pathtracer's bundled glslSmartDeNoise here to cut the grain at a
    // practical sample count. Four tested parameter sets: the shader's own defaults did
    // nothing visible; a moderate bump posterized the facets into flat blocks, destroying
    // real gradient detail; an aggressive one gave a ~120px bilateral kernel that stalled
    // the GPU for a full page reload; an intermediate setting was barely different from no
    // denoise at all. This noise is chromatic and high-frequency (three interleaved fire
    // bands, not one smooth luminance pass), which a bilateral filter tuned for typical
    // monochrome path-tracer grain doesn't handle well out of the box. Reverted rather
    // than ship an extra render pass with no demonstrated benefit — revisit with more
    // deliberate tuning time, or a denoiser designed for multi-channel noise.

    this.tracer.setScene(scene, camera);
    this.applyBandIor();
  }

  /** Samples accumulated per band before a capture, growing with each completed cycle. */
  private get samplesPerBand(): number {
    return Math.min(3 * 2 ** this.cycles, 128);
  }

  private applyBandIor(): void {
    this.material.ior = this.baseIor + BANDS[this.band]! * this.iorSpread;
    this.tracer.updateMaterials();
    this.tracer.reset();
  }

  get hasImage(): boolean {
    return this.cycles > 0;
  }


  get samples(): number {
    return this.cycles === 0 ? 0 : Math.min(3 * 2 ** (this.cycles - 1), 128) * BANDS.length;
  }

  /**
   * Re-read the camera after its pose changes. The tracer snapshots the camera at
   * `setScene`, so without this it keeps tracing from the original pose — which for a
   * default camera means from inside the stone.
   */
  updateCamera(): void {
    this.tracer.updateCamera();
    this.reset();
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.reset();
  }

  reset(): void {
    this.band = 0;
    this.cycles = 0;
    this.applyBandIor();
  }

  /** Advance accumulation by one sample, capturing and compositing when a band completes. */
  renderFrame(): void {
    this.tracer.renderSample();

    if (this.tracer.samples >= this.samplesPerBand) {
      const target = this.tracer.target;
      for (const rt of this.bandTargets) rt.setSize(target.width, target.height);

      this.denoiseMaterial.map = target.texture;
      this.renderer.setRenderTarget(this.bandTargets[this.band]!);
      this.denoiseQuad.render(this.renderer);
      this.renderer.setRenderTarget(null);

      this.band = (this.band + 1) % BANDS.length;
      if (this.band === 0) this.cycles += 1;
      this.applyBandIor();
    }

    if (this.cycles > 0) {
      this.compositeMaterial.uniforms.tR!.value = this.bandTargets[0]!.texture;
      this.compositeMaterial.uniforms.tG!.value = this.bandTargets[1]!.texture;
      this.compositeMaterial.uniforms.tB!.value = this.bandTargets[2]!.texture;
      this.compositeQuad.render(this.renderer);
    }
  }

  dispose(): void {
    this.material.ior = this.baseIor;
    this.tracer.dispose();
    this.denoiseQuad.dispose();
    this.compositeQuad.dispose();
    for (const rt of this.bandTargets) rt.dispose();
    this.renderer.dispose();
  }
}
