import * as THREE from "three";
import {
  convertToTexture,
  exp,
  float,
  Fn,
  Loop,
  max,
  nodeObject,
  passTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RenderTarget,
  RendererUtils,
  TempNode,
  type Node,
  type NodeFrame,
} from "three/webgpu";

/**
 * Star-filter glints: the cross-shaped sparkle a star filter or a lens's diffraction draws
 * on every pinpoint highlight, and the signature of jewelry photography. Only the hottest
 * HDR values (gem glints, not lit surfaces) pass the threshold, and each is streaked along
 * a few fixed lines while keeping its own colour, so dispersed fire spreads into the rays.
 *
 * Structured like three's AnamorphicNode: one quad pass into a reduced-resolution target,
 * read back as a texture and added before tone mapping.
 */

type StarLine = { angle: number; reach: number; weight: number };

/** Long vertical/horizontal rays with shorter diagonals: the classic eight-point jewel sparkle. */
const STAR_LINES: StarLine[] = [
  { angle: 0, reach: 1, weight: 1 },
  { angle: Math.PI / 2, reach: 1, weight: 1 },
  { angle: Math.PI / 4, reach: 0.55, weight: 0.45 },
  { angle: (3 * Math.PI) / 4, reach: 0.55, weight: 0.45 },
];

const SAMPLES_PER_SIDE = 20;

type TextureLikeNode = Node<"vec4"> & {
  uvNode?: Node | null;
  value: THREE.Texture;
  sample: (uv: Node) => Node<"vec4">;
};

type RendererState = ReturnType<typeof RendererUtils.resetRendererState>;

const quad = new QuadMesh();
let rendererState: RendererState | undefined;

export class StarGlintNode extends TempNode {
  static get type(): string {
    return "StarGlintNode";
  }

  readonly textureNode: TextureLikeNode;
  readonly threshold: Node<"float">;
  readonly intensity: Node<"float">;
  /** Ray step in source pixels; total ray length ≈ SAMPLES_PER_SIDE × reach. */
  readonly reach: Node<"float">;
  resolutionScale = 0.5;

  private readonly renderTarget = new RenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType });
  private readonly invSize = uniform(new THREE.Vector2());
  private readonly outputTexture: Node<"vec4">;
  private material: NodeMaterial | null = null;

  constructor(textureNode: TextureLikeNode, threshold: Node<"float">, intensity: Node<"float">, reach: Node<"float">) {
    super("vec4");
    this.textureNode = textureNode;
    this.threshold = threshold;
    this.intensity = intensity;
    this.reach = reach;
    this.renderTarget.texture.name = "star-glints";
    this.outputTexture = passTexture(this as never, this.renderTarget.texture) as unknown as Node<"vec4">;
    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  getTextureNode(): Node<"vec4"> {
    return this.outputTexture;
  }

  setSize(width: number, height: number): void {
    this.invSize.value.set(1 / width, 1 / height);
    this.renderTarget.setSize(
      Math.max(Math.round(width * this.resolutionScale), 1),
      Math.max(Math.round(height * this.resolutionScale), 1),
    );
  }

  updateBefore(frame: NodeFrame): boolean | undefined {
    const renderer = frame.renderer as Parameters<typeof RendererUtils.resetRendererState>[0];
    // The saved state is created on first use; three accepts an empty slot here.
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as RendererState);
    const source = this.textureNode.value as THREE.Texture & { image: { width: number; height: number } };
    this.setSize(source.image.width, source.image.height);
    quad.material = this.material!;
    quad.name = "StarGlints";
    renderer.setRenderTarget(this.renderTarget);
    quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, rendererState);
    return undefined;
  }

  setup(): Node<"vec4"> {
    const source = this.textureNode;
    const uvNode = (source.uvNode ?? uv()) as Node<"vec2">;
    const bright = (color: Node<"vec3">) => max(color.sub(this.threshold), vec3(0));

    const streaks = Fn(() => {
      const total = vec3(0).toVar();
      for (const line of STAR_LINES) {
        const step = vec2(Math.cos(line.angle), Math.sin(line.angle)).mul(this.invSize).mul(this.reach).mul(line.reach);
        Loop({ start: 1, end: SAMPLES_PER_SIDE + 1 }, ({ i }) => {
          const index = float(i as unknown as Node<"int">);
          const t = index.div(SAMPLES_PER_SIDE);
          // A bright core with a long soft tail, like diffraction spikes.
          const falloff = exp(t.mul(-4.5)).mul(line.weight);
          const offset = step.mul(index);
          const ahead = bright(source.sample(uvNode.add(offset)).rgb as Node<"vec3">);
          const behind = bright(source.sample(uvNode.sub(offset)).rgb as Node<"vec3">);
          total.addAssign(ahead.add(behind).mul(falloff));
        });
      }
      return vec4(total.mul(this.intensity).div(SAMPLES_PER_SIDE), 1);
    });

    const material = this.material ?? (this.material = new NodeMaterial());
    material.name = "StarGlints";
    material.fragmentNode = streaks();
    return this.outputTexture;
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.material?.dispose();
  }
}

export function starGlints(
  node: Node,
  threshold: Node<"float"> | number = 2.5,
  intensity: Node<"float"> | number = 1,
  reach: Node<"float"> | number = 2.2,
): StarGlintNode {
  return new StarGlintNode(
    convertToTexture(node) as unknown as TextureLikeNode,
    nodeObject(threshold) as Node<"float">,
    nodeObject(intensity) as Node<"float">,
    nodeObject(reach) as Node<"float">,
  );
}
