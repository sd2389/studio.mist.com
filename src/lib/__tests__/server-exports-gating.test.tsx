import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { LookSnapshot } from "@/features/viewer";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import { useHiresExportStore } from "@/stores/hires-export-store";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";
import { drawnButton, drawnButtons } from "@/test/recording-button";

/*
 * The server_exports flag picks how a still is made (ADR 0005, C2): on, the export screens
 * create render jobs and nothing renders in the browser; off, they render in the browser as
 * before. Each screen is drawn on the server and its buttons clicked through the recorded
 * handlers (src/test/recording-button.tsx).
 */

const flag = vi.hoisted(() => ({ serverExports: false as boolean | null }));
const browser = vi.hoisted(() => ({ exportStill: vi.fn(async () => {}) }));

vi.mock("@/features/render/ui/useServerExports", () => ({ useServerExports: () => flag.serverExports }));
vi.mock("@/features/render/ui/StillExportSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/render/ui/StillExportSettings")>()),
  exportStill: browser.exportStill,
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

const { ExportSceneProvider, RenderJobButton } = await import("@/features/render");
const { HiResExportModal } = await import("@/components/modals/HiResExportModal");
const { EditorImageTab } = await import("@/features/editor/ui/EditorImageTab");

const LOOK = { material: "platinum", lighting: "studio", slot_selections: { "Metal 1": "platinum" } } as unknown as LookSnapshot;
const LIVE_VIEW = { view: { position: [0.5, 0.75, 2], target: [0, 0.1, 0] } };
const STILL_4K = {
  camera: LIVE_VIEW,
  width: 3840,
  height: 2160,
  format: "png",
  jpeg_quality: 0.95,
  transparent: false,
};
const JOB = {
  id: 4812,
  kind: "still",
  status: "queued",
  scene_id: 812,
  spec: { ...STILL_4K, frames: 1, output_names: ["ring-abc-4K-16x9.png"] },
  outputs: [],
  created_at: "2026-10-05T14:02:11Z",
};

let fetch: MockInstance<typeof globalThis.fetch>;

/** The API's answers: a job for every create, nothing else. */
function stubApi() {
  fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/render-jobs") return Response.json(JOB, { status: 201 });
    if (url === "/api/render-jobs/bulk") return Response.json({ jobs: [JOB, { ...JOB, id: 4813 }] }, { status: 201 });
    return Response.json({ error: "Not stubbed" }, { status: 404 });
  });
}

/** Every request the page sent, as "METHOD url". */
function sent(): string[] {
  return fetch.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`);
}

function sentBody(url: string): unknown {
  const call = fetch.mock.calls.find(([input]) => String(input) === url);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

function sentKey(url: string): string | null {
  const call = fetch.mock.calls.find(([input]) => String(input) === url);
  return new Headers(call?.[1]?.headers).get("Idempotency-Key");
}

function inStudio(children: ReactNode, sceneId: number | null = 812) {
  return renderToStaticMarkup(
    <ExportSceneProvider value={sceneId ? { sceneId, look: () => LOOK } : null}>{children}</ExportSceneProvider>,
  );
}

beforeEach(() => {
  drawnButtons.length = 0;
  browser.exportStill.mockClear();
  stubApi();
  const { position, target } = LIVE_VIEW.view;
  useOrbitControlsStore.setState({
    controls: {
      object: { position: { x: position[0], y: position[1], z: position[2] } },
      target: { x: target[0], y: target[1], z: target[2] },
    } as never,
  });
  useHiresExportStore.setState({ refs: { gl: { domElement: { width: 1600, height: 900 } }, scene: {}, camera: {} } as never });
});

afterEach(() => {
  vi.restoreAllMocks();
  useOrbitControlsStore.setState({ controls: null });
  useHiresExportStore.setState({ refs: null });
});

describe("the still dialog", () => {
  const dialog = <HiResExportModal open onOpenChange={() => {}} modelId="ring-abc" />;

  it("with server exports on, starts a still job of the live view and renders nothing here", async () => {
    flag.serverExports = true;
    const html = inStudio(dialog);
    expect(html).toContain("on our servers");
    expect(html).toContain("Pricing…");

    drawnButton("Render & download PNG").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toEqual({
      kind: "still",
      scene_id: 812,
      variant_id: null,
      look: LOOK,
      name: "ring-abc-4K-16x9",
      spec: STILL_4K,
    });
    expect(sentKey("/api/render-jobs")).toMatch(/^[0-9a-f-]{36}$/);
    expect(browser.exportStill).not.toHaveBeenCalled();
  });

  it("with server exports on, starts nothing without a saved scene", () => {
    flag.serverExports = true;
    const html = inStudio(dialog, null);

    expect(html).toContain("Stills render from a saved piece");
    expect(drawnButton("Render & download PNG").disabled).toBe(true);
  });

  it("with server exports off, renders in the browser as before and starts no job", async () => {
    flag.serverExports = false;
    const html = inStudio(dialog);
    expect(html).not.toContain("on our servers");
    expect(html).not.toContain("Pricing…");

    drawnButton("Render & download PNG").click();
    await vi.waitFor(() => expect(browser.exportStill).toHaveBeenCalledTimes(1));

    expect(browser.exportStill).toHaveBeenCalledWith(expect.objectContaining({ resolution: "4k", format: "png" }), "ring-abc-4K-16x9");
    expect(sent()).toEqual([]);
  });

  it("starts neither way until the flag is read", () => {
    flag.serverExports = null;
    inStudio(dialog);

    expect(drawnButton("Render & download PNG").disabled).toBe(true);
  });
});

describe("the editor's Images tab", () => {
  const tab = (
    <EditorImageTab
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

  it("with server exports on, starts a still job of the studio's look and renders nothing here", async () => {
    flag.serverExports = true;
    expect(inStudio(tab)).not.toContain("8K requires significant GPU memory");

    drawnButton("Render & download").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toEqual({
      kind: "still",
      scene_id: 812,
      variant_id: null,
      look: LOOK,
      name: "ring-abc-4K-16x9",
      spec: STILL_4K,
    });
    expect(browser.exportStill).not.toHaveBeenCalled();
  });

  it("with server exports off, renders in the browser as before and starts no job", async () => {
    flag.serverExports = false;
    inStudio(tab);

    drawnButton("Render & download").click();
    await vi.waitFor(() => expect(browser.exportStill).toHaveBeenCalledTimes(1));

    expect(browser.exportStill).toHaveBeenCalledWith(expect.objectContaining({ resolution: "4k" }), "ring-abc-4K-16x9");
    expect(sent()).toEqual([]);
  });
});

describe("a Render button for several jobs", () => {
  it("starts them in one bulk request with its own Idempotency-Key", async () => {
    const one = { kind: "still" as const, scene_id: 812, look: LOOK, name: "ring-live-4K", spec: STILL_4K as never };
    const two = { kind: "still" as const, scene_id: 913, variant_id: "variant-pt", name: "halo-platinum-4K", spec: STILL_4K as never };
    renderToStaticMarkup(
      <RenderJobButton requests={() => [one, two]} bulk>
        Render 2 images
      </RenderJobButton>,
    );

    drawnButton("Render 2 images").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs/bulk"));

    expect(sentBody("/api/render-jobs/bulk")).toEqual({ jobs: [one, two] });
    expect(sentKey("/api/render-jobs/bulk")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
