import { unzipSync } from "fflate";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../campaign-pack/domain/defaults";
import { buildPackDocuments } from "../campaign-pack/domain/documents";
import { planCampaignPack } from "../campaign-pack/domain/plan";
import type { PackIdentity, PackPlan, TurntableJob } from "../campaign-pack/domain/types";
import { PackZipWriter } from "../campaign-pack/domain/zip-writer";
import type { PackRenderBackend, PackVideoEncoder } from "../campaign-pack/engine/pack-backend";
import { runCampaignPack } from "../campaign-pack/engine/runner";
import type { StagePackInput } from "../campaign-pack/engine/stage-pack";
import { readHarnessJob, type PayloadOfKind } from "./job-payload";
import { renderCampaignPack } from "./render-pack";
import type { SinkClient, VideoClip } from "./sink-client";

/*
 * The harness's Campaign Pack (ADR 0005, D2) against the studio's: the same planner, names and
 * runner, with the files going to the worker's sink and the turntables as frames, instead of
 * into a ZIP in memory. The GPU is a stand-in that draws nothing: each output is its job's id.
 */

const stage = vi.hoisted(() => ({ tracedGems: false, ticking: [] as number[], stops: 0, input: null as StagePackInput | null }));

vi.mock("@/features/viewer", () => ({
  resolveModelConfig: (look: { model_config: unknown }) => look.model_config,
  tickFixedClock: (first: number) => {
    stage.ticking.push(first);
    return () => (stage.stops += 1);
  },
}));
vi.mock("../campaign-pack/engine/gem-scope", () => ({ sceneHasTracedGems: () => stage.tracedGems }));
// One small frame for every turntable frame: what the pixels are doesn't matter here.
vi.mock("./render-frames", () => ({ createPixelReader: () => () => new Uint8ClampedArray(4) }));
// The stage the pack renders from, and its GPU: the stand-in backend in place of the offscreen renderer.
vi.mock("../campaign-pack/engine/stage-pack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../campaign-pack/engine/stage-pack")>()),
  readPackStage: () => ({ gl: {}, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(42, 1, 0.01, 200) }),
  renderPackOnStage: async (_stage: unknown, input: StagePackInput) => {
    stage.input = input;
    const stop = input.keepStageTicking?.();
    stop?.();
    return runCampaignPack({
      plan: input.plan,
      backend: standInBackend(input.openVideo),
      writer: input.writer,
      signal: input.signal,
      onProgress: input.onProgress,
      buildDocuments: (files, failures) =>
        buildPackDocuments({ ...input, backgroundLabel: "#FFFFFF (white)", files, failures }),
    });
  },
}));

const IDENTITY: PackIdentity = { modelId: "solitaire.glb", sku: "RING-1", name: "Solitaire ring" };
const GENERATED_AT = new Date("2026-10-06T09:00:00Z");
const typed = (body: string, type: string) => new Blob([body], { type });

/** The GPU stand-in. Its turntables go to `openVideo` frame by frame, as the pack's backend sends them. */
function standInBackend(openVideo?: (job: TurntableJob) => Promise<PackVideoEncoder>): PackRenderBackend {
  return {
    notices: [],
    setMetal: async () => {},
    renderStill: async (job) => ({
      jpg: job.jpgPath ? typed(`jpg:${job.id}`, "image/jpeg") : null,
      png: job.pngPath ? typed(`png:${job.id}`, "image/png") : null,
    }),
    renderSpinFrame: async (job, index) => typed(`spin:${job.id}:${index}`, "image/jpeg"),
    async renderTurntable(job, onFrame) {
      if (!openVideo) {
        for (let i = 0; i < job.frameCount; i++) onFrame(i);
        return typed(`mp4:${job.id}`, "video/mp4");
      }
      const encoder = await openVideo(job);
      for (let i = 0; i < job.frameCount; i++) {
        await encoder.addFrame({} as OffscreenCanvas, i);
        onFrame(i);
      }
      return encoder.finish();
    },
    renderScope: async (job) => typed(`aset:${job.id}`, "image/png"),
    dispose() {},
  };
}

type SinkCall =
  | { posted: "file"; name: string; type: string; body: string }
  | { posted: "video"; name: string; clip: VideoClip }
  | { posted: "frames"; count: number }
  | { posted: "end"; name: string };

/** The worker's sink, as the page sees it: it takes everything and says each MP4 is 7000 bytes and some. */
function recordingSink(refuse: (name: string) => boolean = () => false): SinkClient & { calls: SinkCall[] } {
  const calls: SinkCall[] = [];
  return {
    calls,
    fetchModel: async () => new Blob(),
    async postFile(name, file) {
      if (refuse(name)) throw new Error(`sink POST /files/${encodeURIComponent(name)}: 413`);
      calls.push({ posted: "file", name, type: file.type, body: await file.text() });
    },
    async startVideo(name, clip) {
      calls.push({ posted: "video", name, clip });
    },
    async postFrame() {
      const last = calls.at(-1);
      if (last?.posted === "frames") last.count += 1;
      else calls.push({ posted: "frames", count: 1 });
    },
    async endVideo(name) {
      calls.push({ posted: "end", name });
      return 7000 + calls.length;
    },
    postProgress: async () => {},
  };
}

function packJob(spec: Record<string, unknown> = {}): PayloadOfKind<"campaign_pack"> {
  const payload = readHarnessJob({
    payload: {
      kind: "campaign_pack",
      spec: { ...DEFAULT_CAMPAIGN_PACK_CONFIG, frames: 2041, output_names: ["RING-1_campaign-pack.zip"], ...spec },
      look: { material: "platinum", lighting: "studio", slot_selections: {}, scene_settings: { poses: [] }, model_config: { slotTokens: { "Metal 1": ["metal 1"] } } },
      look_items: { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] },
      model: { path: "/render-jobs/7/inputs/model" },
      watermark: false,
      limits: { max_edge: 2000, max_runtime_seconds: 3600 },
      scene: { id: 812, name: IDENTITY.name, sku: IDENTITY.sku, viewer_id: IDENTITY.modelId },
      app_url: "https://studio.mist.com",
    },
    sink: { url: "http://127.0.0.1:41234", token: "f00d" },
  }).payload;
  if (payload.kind !== "campaign_pack") throw new Error("not a pack");
  return payload;
}

/** The studio's own pack of the default config, into its ZIP in memory: the entries in the ZIP's order. */
async function browserPack(hasTracedGems: boolean): Promise<{ plan: PackPlan; entries: string[] }> {
  const plan = planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, { identity: IDENTITY, savedPoses: [], hasTracedGems });
  const writer = new PackZipWriter(GENERATED_AT);
  await runCampaignPack({
    plan,
    backend: standInBackend(),
    writer,
    buildDocuments: (files, failures) =>
      buildPackDocuments({
        plan,
        config: DEFAULT_CAMPAIGN_PACK_CONFIG,
        identity: IDENTITY,
        backgroundLabel: "#FFFFFF (white)",
        origin: "https://studio.mist.com",
        files,
        failures,
        generatedAt: GENERATED_AT,
      }),
  });
  return { plan, entries: Object.keys(unzipSync(new Uint8Array(await writer.finish().arrayBuffer()))) };
}

/** Every file the plan names, documents included: what the ZIP must hold. */
function plannedPaths(plan: PackPlan): string[] {
  const outputs = plan.jobs.flatMap((job) => {
    if (job.kind === "still") return [job.jpgPath, job.pngPath].filter((path): path is string => path !== null);
    if (job.kind === "spin") return job.framePaths;
    return [job.path];
  });
  const documents = [plan.spinViewerPath, plan.embedPath, plan.embedSnippetPath, plan.readmePath, plan.manifestPath];
  return [...outputs, ...documents.filter((path): path is string => path !== null)];
}

beforeEach(() => {
  stage.tracedGems = false;
  stage.ticking.length = 0;
  stage.stops = 0;
  stage.input = null;
});

describe("renderCampaignPack", () => {
  it.each([
    [false, 251],
    [true, 252],
  ])("hands the worker every entry of the studio's ZIP, by its name and in its order (traced gems: %s)", async (tracedGems, count) => {
    stage.tracedGems = tracedGems;
    const sink = recordingSink();
    const entries = await renderCampaignPack(packJob(), sink, { firstFrame: 61 });
    const browser = await browserPack(tracedGems);

    expect(entries).toHaveLength(count);
    expect(entries.map((entry) => entry.path)).toEqual(browser.entries);
    expect([...entries.map((entry) => entry.path)].sort()).toEqual(plannedPaths(browser.plan).sort());
    expect(entries.some((entry) => entry.path === "RING-1/cut-scope/aset_top.png")).toBe(tracedGems);
    // The files went in that order, each as it was made; the turntables as frames.
    expect(sink.calls.filter((call) => call.posted === "file" || call.posted === "end").map((call) => call.name)).toEqual(browser.entries);
  });

  it("types every entry as the worker zips it: media stored, documents deflated", async () => {
    const entries = await renderCampaignPack(packJob(), recordingSink(), { firstFrame: 61 });
    const typeOf = (path: string) => entries.find((entry) => entry.path === path)?.content_type;
    expect(typeOf("RING-1/stills/18k-yellow-gold_front.jpg")).toBe("image/jpeg");
    expect(typeOf("RING-1/stills/18k-yellow-gold_front.png")).toBe("image/png");
    expect(typeOf("RING-1/spin/18k-rose-gold/18k-rose-gold_072.jpg")).toBe("image/jpeg");
    expect(typeOf("RING-1/video/18k-white-gold_turntable_1920x1080.mp4")).toBe("video/mp4");
    expect(typeOf("RING-1/spin/spin.html")).toBe("text/html");
    expect(typeOf("RING-1/embed/embed-snippet.html")).toBe("text/html");
    expect(typeOf("RING-1/README.md")).toBe("text/markdown");
    expect(typeOf("RING-1/manifest.json")).toBe("application/json");
  });

  it("streams each turntable to the worker at its size, rate and length, one after another", async () => {
    const sink = recordingSink();
    await renderCampaignPack(packJob(), sink, { firstFrame: 61 });
    const videos = sink.calls.flatMap((call, index) => (call.posted === "video" ? [[call, sink.calls[index + 1], sink.calls[index + 2]]] : []));
    expect(videos.map(([start]) => start)).toEqual(
      ["18k-yellow-gold", "18k-white-gold", "18k-rose-gold"].flatMap((metal) => [
        { posted: "video", name: `RING-1/video/${metal}_turntable_1920x1080.mp4`, clip: { width: 1920, height: 1080, fps: 30, frames: 300 } },
        { posted: "video", name: `RING-1/video/${metal}_turntable_1080x1080.mp4`, clip: { width: 1080, height: 1080, fps: 30, frames: 300 } },
      ]),
    );
    for (const [start, frames, end] of videos) {
      expect(frames).toEqual({ posted: "frames", count: 300 });
      expect(end).toEqual({ posted: "end", name: start!.posted === "video" ? start!.name : "" });
    }
  });

  it("writes the README and manifest of what the worker made, the MP4s at the sizes it reports", async () => {
    const sink = recordingSink();
    await renderCampaignPack(packJob(), sink, { firstFrame: 61 });
    const body = (name: string) => sink.calls.flatMap((call) => (call.posted === "file" && call.name === name ? [call.body] : []))[0]!;
    const manifest = JSON.parse(body("RING-1/manifest.json"));
    const path = "RING-1/video/18k-yellow-gold_turntable_1920x1080.mp4";
    const end = sink.calls.findIndex((call) => call.posted === "end" && call.name === path);
    expect(manifest.files.find((entry: { path: string }) => entry.path === path)).toEqual({
      path, kind: "video", metal: "18k-yellow-gold", width: 1920, height: 1080, bytes: 7000 + end + 1,
    });
    expect(manifest.model).toEqual({ id: "solitaire.glb", sku: "RING-1", name: "Solitaire ring" });
    // Every entry but the manifest itself.
    expect(manifest.files).toHaveLength(250);
    // The embed points at the studio's public address, not the harness's.
    expect(body("RING-1/embed/embed-snippet.html")).toContain('src="https://studio.mist.com/embed/RING-1"');
    expect(body("RING-1/README.md")).toMatch(/^# Solitaire ring — Campaign Pack/);
  });

  it("renders from the job's own view when it isn't auto-framed, and keeps the stage drawing for the probe", async () => {
    const view = { position: [1.2, 0.6, 1.8], target: [0, 0.1, 0] };
    await renderCampaignPack(packJob({ autoFrame: false, view }), recordingSink(), { firstFrame: 61 });
    const input = stage.input!;
    expect(input.camera.position.toArray()).toEqual(view.position);
    expect(input.camera.fov).toBe(42);
    expect(input.orbitTarget).toEqual(view.target);
    expect(input.limits).toEqual({ maxEdge: 2000, watermark: false });
    expect(input.slotTokens).toEqual({ "Metal 1": ["metal 1"] });
    expect([stage.ticking, stage.stops]).toEqual([[61], 1]);
    // A re-skinned metal without the studio's environment would have no reflections: the job stops instead.
    expect(input.requireEnvironment).toBe(true);
  });

  it("stops the pack at the first file the worker refuses, for that reason", async () => {
    const sink = recordingSink((name) => name.endsWith("_side.png"));
    await expect(renderCampaignPack(packJob(), sink, { firstFrame: 61 })).rejects.toThrow(
      "sink POST /files/RING-1%2Fstills%2F18k-yellow-gold_side.png: 413",
    );
    expect(sink.calls.filter((call) => call.posted === "file").map((call) => call.name).at(-1)).toBe("RING-1/stills/18k-yellow-gold_side.jpg");
  });

  it("refuses a pack that makes nothing for this piece", async () => {
    const spec = { angleIds: [], turntable: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.turntable, enabled: false }, spin: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.spin, enabled: false } };
    await expect(renderCampaignPack(packJob(spec), recordingSink(), { firstFrame: 61 })).rejects.toThrow(/^invalid render job/);
  });
});
