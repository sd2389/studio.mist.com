import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { LookSnapshot } from "@/features/viewer";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";
import { drawnButton, drawnButtons } from "@/test/recording-button";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../domain/defaults";

/*
 * The server_exports flag picks where a Campaign Pack renders (ADR 0005, D2): on, the dialog
 * creates a campaign_pack job, shows its price, then its progress and its ZIP, and may close while
 * it renders; off, the pack renders in this browser as it always has. Drawn on the server, its
 * buttons clicked through the recorded handlers (src/test/recording-button.tsx).
 */

const flag = vi.hoisted(() => ({ serverExports: false as boolean | null }));
const studio = vi.hoisted(() => ({ hasTracedGems: false }));
const browser = vi.hoisted(() => ({
  status: "idle" as "idle" | "running",
  start: vi.fn(async () => {}),
  closed: [] as boolean[],
  dialogOpenChange: null as ((open: boolean) => void) | null,
}));

vi.mock("../../ui/useServerExports", () => ({ useServerExports: () => flag.serverExports }));
vi.mock("../../ui/useExportPlan", () => ({
  useExportPlan: () => ({ label: "Grow", maxEdge: 8192, watermark: false, campaignPack: true }),
}));
vi.mock("../engine/studio-look", () => ({
  readStudioLook: () => ({ backdrop: null, hasStudioSet: false, hasTracedGems: studio.hasTracedGems }),
}));
vi.mock("./usePackIdentity", () => ({ usePackIdentity: () => ({ modelId: "solitaire.glb", sku: "RING-1", name: "Solitaire ring" }) }));
// The browser's own pack, which the flag off still runs: its state, and what starting it asks for.
vi.mock("./useCampaignPackRun", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useCampaignPackRun")>()),
  useCampaignPackRun: () => ({
    state: browser.status === "running" ? { status: "running", progress: { fraction: 0.4, label: "", filesWritten: 0, failures: 0, elapsedMs: 0, etaMs: null } } : { status: "idle" },
    start: browser.start,
    cancel: () => {},
    reset: () => {},
  }),
}));
vi.mock("@/components/ui/button", async (importOriginal) =>
  (await import("@/test/recording-button")).recordingButtonModule(await importOriginal()),
);
// Dialog content, drawn in place rather than in a portal; the dialog's own close, kept to call.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const inline = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children?: ReactNode }) => {
      browser.dialogOpenChange = onOpenChange;
      return open ? inline({ children }) : null;
    },
    DialogContent: inline,
    DialogDescription: inline,
    DialogHeader: inline,
    DialogTitle: inline,
  };
});

const { ExportSceneProvider } = await import("../../ui/export-scene");
const { CampaignPackDialog } = await import("./CampaignPackDialog");

const LOOK = { material: "platinum", lighting: "studio", slot_selections: { "Metal 1": "platinum" } } as unknown as LookSnapshot;
const LIVE_VIEW = { position: [0.5, 0.75, 2] as [number, number, number], target: [0, 0.1, 0] as [number, number, number] };
const JOB = {
  id: 4820,
  kind: "campaign_pack",
  status: "queued",
  scene_id: 812,
  spec: { ...DEFAULT_CAMPAIGN_PACK_CONFIG, cutScope: false, frames: 2040, output_names: ["RING-1_campaign-pack.zip"] },
  outputs: [],
  credits: 48,
  credit_state: "held",
  created_at: "2026-10-06T09:00:00Z",
};

let fetch: MockInstance<typeof globalThis.fetch>;

function sent(): string[] {
  return fetch.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`);
}

function sentBody(url: string): unknown {
  const call = fetch.mock.calls.find(([input]) => String(input) === url);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

function drawDialog(sceneId: number | null = 812) {
  const dialog = <CampaignPackDialog open onOpenChange={(open) => browser.closed.push(open)} modelId="solitaire.glb" sceneId={812} />;
  return renderToStaticMarkup(
    <ExportSceneProvider value={sceneId ? { sceneId, look: () => LOOK } : null}>{dialog}</ExportSceneProvider>,
  );
}

beforeEach(() => {
  drawnButtons.length = 0;
  browser.status = "idle";
  browser.start.mockClear();
  browser.closed.length = 0;
  studio.hasTracedGems = false;
  fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) === "/api/render-jobs") return Response.json(JOB, { status: 201 });
    return Response.json({ error: "Not stubbed" }, { status: 404 });
  });
  useOrbitControlsStore.setState({
    controls: {
      object: { position: { x: LIVE_VIEW.position[0], y: LIVE_VIEW.position[1], z: LIVE_VIEW.position[2] } },
      target: { x: LIVE_VIEW.target[0], y: LIVE_VIEW.target[1], z: LIVE_VIEW.target[2] },
    } as never,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useOrbitControlsStore.setState({ controls: null });
});

describe("the Campaign Pack dialog, with server exports on", () => {
  beforeEach(() => {
    flag.serverExports = true;
  });

  it("prices the pack and starts one campaign_pack job of the scene in the studio's look, rendering nothing here", async () => {
    const html = drawDialog();
    expect(html).toContain("rendered on our servers into one ZIP");
    expect(html).toContain("Pricing…");

    drawnButton("Render campaign pack").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toEqual({
      kind: "campaign_pack",
      scene_id: 812,
      variant_id: null,
      look: LOOK,
      // The pack's root folder, so the ZIP is named as the studio's pack names it.
      name: "RING-1",
      // No ASET image for a piece without traced gems: nobody pays for one that can't be made.
      spec: { ...DEFAULT_CAMPAIGN_PACK_CONFIG, cutScope: false },
    });
    expect(browser.start).not.toHaveBeenCalled();
  });

  it("asks for the ASET image where the piece has traced gems", async () => {
    studio.hasTracedGems = true;
    drawDialog();
    drawnButton("Render campaign pack").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    expect(sentBody("/api/render-jobs")).toMatchObject({ spec: { cutScope: true } });
  });

  it("closes while the pack renders, which goes on rendering", async () => {
    drawDialog();
    drawnButton("Render campaign pack").click();
    await vi.waitFor(() => expect(sent()).toContain("POST /api/render-jobs"));

    browser.dialogOpenChange!(false);
    expect(browser.closed).toEqual([false]);
    expect(sent().filter((request) => request.includes("/cancel"))).toEqual([]);
  });

  it("starts nothing without a saved scene to render", () => {
    const html = drawDialog(null);
    expect(html).toContain("Packs render from a saved piece");
    expect(drawnButton("Render campaign pack").disabled).toBe(true);
  });
});

describe("the Campaign Pack dialog, with server exports off", () => {
  beforeEach(() => {
    flag.serverExports = false;
  });

  it("renders the pack in this browser as before, and starts no job", async () => {
    const html = drawDialog();
    expect(html).toContain("rendered on this device into one ZIP");
    expect(html).not.toContain("Pricing…");

    drawnButton("Render campaign pack").click();
    await vi.waitFor(() => expect(browser.start).toHaveBeenCalledTimes(1));

    expect(browser.start).toHaveBeenCalledWith(expect.objectContaining({ config: DEFAULT_CAMPAIGN_PACK_CONFIG }));
    expect(sent()).toEqual([]);
  });

  it("stays open while the pack renders here, as before", () => {
    browser.status = "running";
    drawDialog();
    browser.dialogOpenChange!(false);
    expect(browser.closed).toEqual([]);
  });

  it("starts neither way until the flag is read", () => {
    flag.serverExports = null;
    drawDialog();
    expect(drawnButton("Render campaign pack").disabled).toBe(true);
  });
});
