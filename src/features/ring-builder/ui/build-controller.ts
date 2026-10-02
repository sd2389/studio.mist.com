import { buildJewelry, exportAllSizesZip, type BuiltPart, type JewelryDesign, type JewelrySpecs } from "@/lib/jewelry-cad";
import { deserializeParts, designKey, type BuildRequest, type BuildResponse } from "@/features/ring-builder/domain/build-protocol";
import { GemGeometryPool } from "@/features/ring-builder/ui/gem-geometry-pool";

/**
 * Owns the geometry worker. The newest design always wins: one build is in flight at a
 * time and, when it lands, only the latest requested design is sent next — so a slider
 * drag never queues stale work. Recent results are kept (and disposed on eviction), which
 * makes flipping back to an earlier option instant.
 */

export type DesignBuild = { key: string; design: JewelryDesign; parts: BuiltPart[]; specs: JewelrySpecs };
export type BuildSnapshot = { build: DesignBuild | null; building: boolean; error: string | null };

type ZipJob = { resolve: (bytes: Uint8Array) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void };

const CACHE_SIZE = 12;

export class BuildController {
  private worker: Worker | null;
  private readonly cache = new Map<string, DesignBuild>();
  private readonly gems = new GemGeometryPool();
  private readonly zipJobs = new Map<number, ZipJob>();
  private wanted: JewelryDesign | null = null;
  private inFlight: { key: string; design: JewelryDesign } | null = null;
  private shownKey: string | null = null;
  private nextId = 1;
  private snapshot: BuildSnapshot = { build: null, building: true, error: null };

  constructor(
    private readonly onChange: (snapshot: BuildSnapshot) => void,
    createWorker: () => Worker | null,
  ) {
    this.worker = createWorker();
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<BuildResponse>) => this.receive(event.data);
      this.worker.onerror = () => this.dropWorker();
    }
  }

  /** The worker failed to load or crashed: keep designing on the main thread instead. */
  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.zipJobs.values()) job.reject(new Error("Export worker stopped"));
    this.zipJobs.clear();
    this.inFlight = null;
    this.pump();
  }

  setDesign(design: JewelryDesign): void {
    this.wanted = design;
    this.pump();
  }

  sizesZip(name: string, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
    const design = this.wanted;
    if (!design) return Promise.reject(new Error("No design yet"));
    if (!this.worker) return Promise.resolve(exportAllSizesZip(design, { name, onProgress }));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.zipJobs.set(id, { resolve, reject, onProgress });
      this.worker!.postMessage({ type: "sizes-zip", id, design, name } satisfies BuildRequest);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.zipJobs.values()) job.reject(new Error("Designer closed"));
    this.zipJobs.clear();
    for (const build of this.cache.values()) this.gems.release(build.parts);
    this.cache.clear();
    this.gems.clear();
  }

  private emit(patch: Partial<BuildSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }

  private pump(): void {
    const design = this.wanted;
    if (!design || this.inFlight) return;
    const key = designKey(design);
    const hit = this.cache.get(key);
    if (hit) {
      // Touch the entry so the build on screen is never the next one evicted.
      this.cache.delete(key);
      this.cache.set(key, hit);
      this.show(hit);
      return;
    }
    this.inFlight = { key, design };
    this.emit({ building: true });
    if (this.worker) {
      this.worker.postMessage({ type: "build", id: this.nextId++, design } satisfies BuildRequest);
      return;
    }
    setTimeout(() => this.buildLocally(key, design), 0);
  }

  private buildLocally(key: string, design: JewelryDesign): void {
    try {
      const built = buildJewelry(design);
      this.land({ key, design, parts: built.parts, specs: built.specs });
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  private receive(msg: BuildResponse): void {
    if (msg.type === "built" && this.inFlight) {
      this.land({ ...this.inFlight, parts: deserializeParts(msg.parts), specs: msg.specs });
      return;
    }
    const job = this.zipJobs.get(msg.id);
    if (msg.type === "progress") job?.onProgress?.(msg.done, msg.total);
    if (msg.type === "zip" && job) {
      job.resolve(msg.bytes);
      this.zipJobs.delete(msg.id);
    }
    if (msg.type === "error") {
      if (job) {
        job.reject(new Error(msg.message));
        this.zipJobs.delete(msg.id);
      } else this.fail(msg.message);
    }
  }

  private land(fresh: DesignBuild): void {
    this.inFlight = null;
    const build = { ...fresh, parts: this.gems.adopt(fresh.parts) };
    this.remember(build);
    if (this.wanted && build.key === designKey(this.wanted)) this.show(build);
    else this.pump();
  }

  private fail(message: string): void {
    this.inFlight = null;
    this.emit({ building: false, error: message });
  }

  private show(build: DesignBuild): void {
    this.shownKey = build.key;
    this.emit({ build, building: false, error: null });
  }

  private remember(build: DesignBuild): void {
    this.cache.delete(build.key);
    this.cache.set(build.key, build);
    while (this.cache.size > CACHE_SIZE) {
      const [oldestKey, oldest] = this.cache.entries().next().value!;
      this.cache.delete(oldestKey);
      if (oldestKey !== this.shownKey) this.gems.release(oldest.parts);
    }
  }
}
