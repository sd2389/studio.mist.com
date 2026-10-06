import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { BatchExport } from "@/features/editor/hooks/useBatchExport";
import type { ExportPlan, RenderJobBulkQuote, RenderJobQuote } from "@/features/render";
import type { LookSnapshot } from "@/features/viewer";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import type { BatchJobTarget } from "@/lib/variants/batch-export";
import { mergePoses } from "@/lib/viewer-scene";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";
import { useVideoCaptureStore } from "@/stores/video-capture-store";
import { drawnButton, drawnButtons } from "@/test/recording-button";

/*
 * The server_exports flag picks how a video is made (ADR 0005, C3): on, the 360° dialog and the
 * editor's Videos tab create turntable jobs, priced first, and nothing records in the browser;
 * off, they record in the browser as before. Each screen is drawn on the server and its buttons
 * clicked through the recorded handlers (src/test/recording-button.tsx). A quote is asked for in
 * an effect, which a server render doesn't run, so what a Render button prices is recorded and
 * answered here instead.
 */

type QuoteRead = { quote: RenderJobQuote | RenderJobBulkQuote | null; error: Error | null; pending: boolean };

const flag = vi.hoisted(() => ({ serverExports: false as boolean | null }));
const plan = vi.hoisted(() => ({ current: null as ExportPlan | null }));
const pricing = vi.hoisted(() => ({ priced: [] as unknown[], answer: null as unknown }));
const picks = vi.hoisted(() => ({ targets: [] as BatchJobTarget[] }));
const browser = vi.hoisted(() => {
  const recorded = async () => ({ kind: "mp4", blob: new Blob(["mp4"]), codec: "avc1.640028", notice: null });
  return { recordTurntable: vi.fn(recorded), recordMultiAngle: vi.fn(recorded) };
});

vi.mock("@/features/render/ui/useServerExports", () => ({ useServerExports: () => flag.serverExports }));
vi.mock("@/features/render/ui/useExportPlan", () => ({ useExportPlan: () => plan.current }));
vi.mock("@/features/render/ui/useRenderJobQuote", () => ({
  useRenderJobQuote: (request: unknown) => {
    pricing.priced.push(request);
    return pricing.answer;
  },
}));
vi.mock("@/lib/video-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/video-capture")>()),
  recordTurntable: browser.recordTurntable,
  recordMultiAngle: browser.recordMultiAngle,
}));
vi.mock("@/features/render/lib/turntable-capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/render/lib/turntable-capture")>()),
  turntableCaptureOptions: async () => ({}),
}));
vi.mock("@/lib/export-presets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export-presets")>()),
  downloadBlob: () => {},
}));
// Multiple's picks, as the tab reads them once its effect has run.
vi.mock("@/features/editor/hooks/useBatchExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/editor/hooks/useBatchExport")>()),
  useBatchTargets: (_batch: unknown, enabled: boolean) => ({ targets: enabled ? picks.targets : null, error: null }),
}));
vi.mock("@/features/render/campaign-pack", () => ({ CampaignPackDialog: () => null, CampaignPackLauncher: () => null }));
vi.mock("@/components/ui/button", async (importOriginal) =>
  (await import("@/test/recording-button")).recordingButtonModule(await importOriginal()),
);
// Dialog content, drawn in place rather than in a portal.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const inline = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) => (open ? inline({ children }) : null),
    DialogContent: inline,
    DialogDescription: inline,
    DialogHeader: inline,
    DialogTitle: inline,
  };
});

const { ExportSceneProvider, FREE_EXPORT_PLAN } = await import("@/features/render");
const { Video360Modal } = await import("@/components/modals/Video360Modal");
const { EditorVideoTab } = await import("@/features/editor/ui/EditorVideoTab");
const { VideoJobRender } = await import("@/features/editor/ui/VideoJobRender");

const LOOK = { material: "platinum", lighting: "studio", slot_selections: { "Metal 1": "platinum" } } as unknown as LookSnapshot;
const LIVE_VIEW = { view: { position: [0.5, 0.75, 2], target: [0, 0.1, 0] } };
/** 1080p at 30 fps, 4 s or 120 frames: both screens' defaults. */
const ORBIT_1080P = { width: 1920, height: 1080, fps: 30, frames: 120, quality: "high", path: { orbit: { start: LIVE_VIEW } } };
const GROW: ExportPlan = {
  label: "Grow",
  maxEdge: 8192,
  watermark: false,
  campaignPack: true,
  video: { maxFps: 60, maxSeconds: 60, max8kSeconds: 20 },
};
const JOB = {
  id: 5120,
  kind: "turntable",
  status: "queued",
  scene_id: 812,
  spec: { ...ORBIT_1080P, output_names: ["ring-abc-360.mp4"] },
  outputs: [],
  created_at: "2026-10-06T14:02:11Z",
};
const PICKS: BatchJobTarget[] = [
  { sceneId: 812, variantId: null, live: true, label: "ring_abc-live" },
  { sceneId: 812, variantId: "variant-rose", live: false, label: "ring_abc-rose_gold" },
  { sceneId: 913, variantId: null, live: false, label: "halo_band-live" },
];

let fetch: MockInstance<typeof globalThis.fetch>;

/** The API's answers: a job for every create, three for a bulk one; nothing else. */
function stubApi() {
  fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/render-jobs") return Response.json(JOB, { status: 201 });
    if (url === "/api/render-jobs/bulk") {
      return Response.json({ jobs: [JOB, { ...JOB, id: 5121 }, { ...JOB, id: 5122 }] }, { status: 201 });
    }
    return Response.json({ error: "Not stubbed" }, { status: 404 });
  });
}

/** Every request the page sent, as "METHOD url". */
function sent(): string[] {
  return fetch.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`);
}

function sentCall(url: string) {
  return fetch.mock.calls.find(([input]) => String(input) === url);
}

function sentBody(url: string): unknown {
  const call = sentCall(url);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

function inStudio(children: ReactNode, sceneId: number | null = 812) {
  return renderToStaticMarkup(
    <ExportSceneProvider value={sceneId ? { sceneId, look: () => LOOK } : null}>{children}</ExportSceneProvider>,
  );
}

/** A picker chip as drawn, by the start of its text: whether it can be picked, and whether the plan locks it. */
function chip(html: string, label: string): { disabled: boolean; locked: boolean } {
  const chips = html.split("<button").slice(1).map((part) => `<button${part.slice(0, part.indexOf("</button>"))}`);
  const found = chips.find((markup) => markup.replace(/<[^>]+>/g, "").startsWith(label));
  if (!found) throw new Error(`No chip "${label}"`);
  return { disabled: /\sdisabled=""/.test(found.slice(0, found.indexOf(">"))), locked: found.includes("(needs a plan upgrade)") };
}

function hasChip(html: string, label: string): boolean {
  return html.split("<button").some((part) => part.slice(part.indexOf(">") + 1).replace(/<[^>]+>/g, "").startsWith(label));
}

const dialog = <Video360Modal open onOpenChange={() => {}} modelId="ring-abc" />;
const tab = (
  <EditorVideoTab
    sceneId={812}
    viewerId="ring-abc"
    modelUrl="/models/ring.glb"
    modelConfig={buildModelConfigFromSlots(["Metal 1"])}
    variantsState={{ activeVariantId: null, items: [] }}
    variantItems={[]}
    onModelConfigChange={() => {}}
    setBatchModelUrl={() => {}}
  />
);

beforeEach(() => {
  drawnButtons.length = 0;
  pricing.priced.length = 0;
  pricing.answer = { quote: null, error: null, pending: true } satisfies QuoteRead;
  plan.current = null;
  picks.targets = PICKS;
  browser.recordTurntable.mockClear();
  browser.recordMultiAngle.mockClear();
  stubApi();
  const { position, target } = LIVE_VIEW.view;
  useOrbitControlsStore.setState({
    controls: {
      object: { position: { x: position[0], y: position[1], z: position[2] } },
      target: { x: target[0], y: target[1], z: target[2] },
    } as never,
  });
  useVideoCaptureStore.setState({ refs: { gl: {}, scene: {}, camera: { position: { x: 0.5, y: 0.75, z: 2 } } } as never });
});

afterEach(() => {
  vi.restoreAllMocks();
  useOrbitControlsStore.setState({ controls: null });
  useVideoCaptureStore.setState({ refs: null });
});

describe("the 360° dialog", () => {
  it("with server exports on, prices and starts a turntable orbiting from the live view, and records nothing here", async () => {
    flag.serverExports = true;
    const html = inStudio(dialog);
    expect(html).toContain("on our servers");
    expect(html).not.toContain("WebCodecs");
    expect(html).toContain("Pricing…");

    const request = { kind: "turntable", scene_id: 812, variant_id: null, look: LOOK, name: "ring-abc-360", spec: ORBIT_1080P };
    expect(pricing.priced.at(-1)).toEqual(request);

    drawnButton("Render video").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toEqual(request);
    expect(new Headers(sentCall("/api/render-jobs")?.[1]?.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(browser.recordTurntable).not.toHaveBeenCalled();
  });

  it("with server exports on, encodes at the quality picked", () => {
    flag.serverExports = true;
    const html = inStudio(dialog);

    expect(html).toContain("Quality");
    expect(html).not.toContain("Bitrate");
    expect(pricing.priced.at(-1)).toMatchObject({ spec: { quality: "high" } });
  });

  it("with server exports on, starts nothing without a saved scene", () => {
    flag.serverExports = true;
    const html = inStudio(dialog, null);

    expect(html).toContain("Videos render from a saved piece");
    expect(drawnButton("Render video").disabled).toBe(true);
  });

  it("with server exports off, records in the browser as before and starts no job", async () => {
    flag.serverExports = false;
    const html = inStudio(dialog);
    // This test's runtime has no WebCodecs, so the PNG ZIP fallback is announced, as before.
    expect(html).toContain("WebCodecs not available in this browser");
    expect(html).toContain("Bitrate");
    expect(html).not.toContain("on our servers");

    drawnButton("Render video").click();
    await vi.waitFor(() => expect(browser.recordTurntable).toHaveBeenCalledTimes(1));

    expect(sent()).toEqual([]);
    expect(pricing.priced).toEqual([]);
  });

  it("starts neither way until the flag is read", () => {
    flag.serverExports = null;
    inStudio(dialog);

    expect(drawnButton("Render video").disabled).toBe(true);
  });
});

describe("the editor's Videos tab", () => {
  it("with server exports on, Simple prices and starts a turntable orbiting from the live view, and records nothing here", async () => {
    flag.serverExports = true;
    const html = inStudio(tab);
    expect(html).not.toContain("WebCodecs");

    const request = { kind: "turntable", scene_id: 812, variant_id: null, look: LOOK, name: "ring-abc-360", spec: ORBIT_1080P };
    expect(pricing.priced.at(-1)).toEqual(request);

    drawnButton("Render video").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toEqual(request);
    expect(browser.recordTurntable).not.toHaveBeenCalled();
  });

  it("with server exports off, records in the browser as before and starts no job", async () => {
    flag.serverExports = false;
    const html = inStudio(tab);
    expect(html).toContain("WebCodecs not available");

    drawnButton("Render video").click();
    await vi.waitFor(() => expect(browser.recordTurntable).toHaveBeenCalledTimes(1));

    expect(sent()).toEqual([]);
    expect(pricing.priced).toEqual([]);
  });

  it("starts neither way until the flag is read", () => {
    flag.serverExports = null;
    inStudio(tab);

    expect(drawnButton("Render video").disabled).toBe(true);
  });
});

describe("the Videos tab's Render on the server", () => {
  const settings = { width: 1920, height: 1080, fps: 30, frames: 120, quality: "high" as const };
  const poses = mergePoses([{ id: "pose-lxk2", name: "Hero", cameraPosition: [1.2, 0.6, 1.8], target: [0, 0, 0] }]);
  const batch = (batchExportEnabled: boolean) => ({ estimatedJobCount: 3, batchExportEnabled }) as unknown as BatchExport;
  const render = (mode: "multi-angle" | "multiple", batchExportEnabled = true) => (
    <VideoJobRender mode={mode} settings={settings} poses={poses} viewerId="ring-abc" batch={batch(batchExportEnabled)} />
  );

  it("Multi-angle starts one turntable cutting through the studio's four poses, then the saved ones", async () => {
    inStudio(render("multi-angle"));

    drawnButton("Render video").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toEqual({
      kind: "turntable",
      scene_id: 812,
      variant_id: null,
      look: LOOK,
      name: "ring-abc-multi-angle",
      spec: { ...settings, path: { poses: ["pose-top", "pose-right", "pose-default", "pose-left", "pose-lxk2"] } },
    });
    expect(browser.recordMultiAngle).not.toHaveBeenCalled();
  });

  it("Multiple prices every scene and variant picked in one bulk quote, then starts them in one bulk request", async () => {
    const quote: RenderJobQuote = {
      credits: 3,
      width: 1920,
      height: 1080,
      frames: 120,
      outputs: ["ring_abc-live-360.mp4"],
      watermark: false,
      warnings: [],
    };
    pricing.answer = {
      quote: { credits: 9, items: PICKS.map(() => ({ quote, refused: null })), refused: null, warnings: [] },
      error: null,
      pending: false,
    } satisfies QuoteRead;
    const html = inStudio(render("multiple"));

    const orbit = { ...settings, path: { orbit: { start: LIVE_VIEW } } };
    const jobs = [
      { kind: "turntable", scene_id: 812, variant_id: null, look: LOOK, name: "ring_abc-live-360", spec: orbit },
      { kind: "turntable", scene_id: 812, variant_id: "variant-rose", look: null, name: "ring_abc-rose_gold-360", spec: orbit },
      { kind: "turntable", scene_id: 913, variant_id: null, look: null, name: "halo_band-live-360", spec: orbit },
    ];
    expect(pricing.priced.at(-1)).toEqual(jobs);
    expect(html).toContain("9 credits");
    expect(html).toContain("for 3 videos");

    drawnButton("Render 3 videos").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs/bulk"));

    expect(sentBody("/api/render-jobs/bulk")).toEqual({ jobs });
    expect(sent()).not.toContain("POST /api/render-jobs");
    expect(browser.recordTurntable).not.toHaveBeenCalled();
  });

  it("Multiple can't start on a plan without batch export, and the bulk quote's refusal offers the upgrade", () => {
    const refusal = "Rendering several scenes or variants at once is part of Grow and Studio, not Free.";
    pricing.answer = {
      quote: { credits: 0, items: [], refused: { status: 402, detail: refusal }, warnings: [] },
      error: null,
      pending: false,
    } satisfies QuoteRead;
    const html = inStudio(render("multiple", false));

    expect(html).toContain(refusal);
    expect(html).toContain('href="/pricing"');
    expect(drawnButton("Render 3 videos").disabled).toBe(true);
  });
});

describe("a server video's plan caps in the pickers", () => {
  it("lock Free's 8K and every rate above 30 fps, drop those above 60, and say why", () => {
    flag.serverExports = true;
    plan.current = FREE_EXPORT_PLAN;
    const dialogHtml = inStudio(dialog);
    const tabHtml = inStudio(tab);

    expect(chip(dialogHtml, "8K")).toEqual({ disabled: true, locked: true });
    expect(chip(dialogHtml, "4K")).toEqual({ disabled: false, locked: false });
    expect(chip(dialogHtml, "60 fps")).toEqual({ disabled: true, locked: true });
    expect(chip(dialogHtml, "30 fps")).toEqual({ disabled: false, locked: false });
    expect(chip(tabHtml, "48 fps").locked).toBe(true);
    expect(hasChip(tabHtml, "90 fps")).toBe(false);
    expect(hasChip(tabHtml, "120 fps")).toBe(false);
    expect(tabHtml).toMatch(/id="video-duration"[^>]*max="20"/);
    expect(dialogHtml).toContain("Free plan exports videos up to 4K, 30 fps and 20 s, with a MIST Studio watermark.");
  });

  it("give Grow 8K and 60 fps, for up to a minute", () => {
    flag.serverExports = true;
    plan.current = GROW;
    const tabHtml = inStudio(tab);

    expect(chip(tabHtml, "8K").locked).toBe(false);
    expect(chip(tabHtml, "60 fps").locked).toBe(false);
    expect(tabHtml).toMatch(/id="video-duration"[^>]*max="60"/);
    expect(tabHtml).not.toContain("plan exports");
  });

  it("surface the API's 402 with the upgrade", () => {
    flag.serverExports = true;
    const tooLong = "Video length limit exceeded for Free (max 20 s).";
    pricing.answer = { quote: null, error: new AuthRequestError(tooLong, 402), pending: false } satisfies QuoteRead;
    const html = inStudio(tab);

    expect(html).toContain(tooLong);
    expect(html).toContain('href="/pricing"');
  });

  it("with server exports off, are the browser's as before: every rate, a minute, and the size cap alone", () => {
    flag.serverExports = false;
    plan.current = FREE_EXPORT_PLAN;
    const tabHtml = inStudio(tab);

    expect(chip(tabHtml, "60 fps")).toEqual({ disabled: false, locked: false });
    expect(chip(tabHtml, "120 fps")).toEqual({ disabled: false, locked: false });
    expect(chip(tabHtml, "8K").locked).toBe(true);
    expect(tabHtml).toMatch(/id="video-duration"[^>]*max="60"/);
    expect(tabHtml).toContain("Free plan exports up to 4K, with a MIST Studio watermark.");
  });
});
