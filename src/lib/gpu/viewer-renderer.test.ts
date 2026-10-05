import { beforeEach, describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ renderers: [] as { canvas: unknown; finishInit: () => void; failInit: () => void }[] }));

// A renderer whose `init()` waits until the test lets it finish, as a GPU adapter request does.
vi.mock("three/webgpu", () => ({
  WebGPURenderer: class {
    canvas: unknown;
    toneMappingExposure = 1;
    private ready: Promise<void>;
    constructor({ canvas }: { canvas: unknown }) {
      this.canvas = canvas;
      let finishInit = () => {};
      let failInit = () => {};
      this.ready = new Promise<void>((resolve, reject) => {
        finishInit = resolve;
        failInit = () => reject(new Error("no adapter"));
      });
      created.renderers.push({ canvas, finishInit, failInit });
    }
    init() {
      return this.ready;
    }
  },
}));

const { createR3FWebGPURenderer } = await import("./viewer-renderer");

/** Waits until `count` renderers have been constructed (after the dynamic `import("three/webgpu")`). */
const constructed = (count: number) => vi.waitFor(() => expect(created.renderers).toHaveLength(count));
/** Gives a pending `createViewerRenderer` time to construct another renderer, if it were going to. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("createR3FWebGPURenderer", () => {
  beforeEach(() => {
    created.renderers.length = 0;
  });

  // R3F's <Canvas> asks again on every render until the first renderer is ready; a second
  // renderer on the canvas drew at the 300x150 of a fresh canvas (the export golden's hang).
  it("gives a canvas one renderer however often R3F asks while it initialises", async () => {
    const canvas = {} as HTMLCanvasElement;
    const first = createR3FWebGPURenderer({ canvas });
    await constructed(1);
    const second = createR3FWebGPURenderer({ canvas });
    const third = createR3FWebGPURenderer({ canvas, antialias: false });
    await settle();
    created.renderers[0]!.finishInit();

    expect(created.renderers).toHaveLength(1);
    expect(await second).toBe(await first);
    expect(await third).toBe(await first);
    expect(await createR3FWebGPURenderer({ canvas })).toBe(await first);
  });

  it("gives every canvas its own renderer", async () => {
    // One after the other: Vitest's mock of a dynamic import misses a second import made at once.
    const a = createR3FWebGPURenderer({ canvas: {} as HTMLCanvasElement });
    await constructed(1);
    const b = createR3FWebGPURenderer({ canvas: {} as HTMLCanvasElement });
    await constructed(2);
    for (const renderer of created.renderers) renderer.finishInit();

    expect(await a).not.toBe(await b);
  });

  it("starts over after a renderer failed to initialise", async () => {
    const canvas = {} as HTMLCanvasElement;
    const failed = createR3FWebGPURenderer({ canvas });
    await constructed(1);
    created.renderers[0]!.failInit();
    await expect(failed).rejects.toThrow("no adapter");

    const retried = createR3FWebGPURenderer({ canvas });
    await constructed(2);
    created.renderers[1]!.finishInit();

    await expect(retried).resolves.toMatchObject({ canvas });
  });
});
