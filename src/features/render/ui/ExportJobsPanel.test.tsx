import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawnButton, drawnButtons } from "@/test/recording-button";
import type { RenderJob } from "../lib/render-jobs-api";

vi.mock("@/components/ui/button", async (importOriginal) =>
  (await import("@/test/recording-button")).recordingButtonModule(await importOriginal()),
);

function renderJob(job: Partial<RenderJob> & Pick<RenderJob, "id" | "status">): RenderJob {
  return {
    kind: "still",
    scene_id: 812,
    batch_id: null,
    spec: { width: 3840, height: 2160, format: "png", frames: 1, output_names: ["solitaire-4K.png"] },
    look: null,
    variant_id: null,
    name: null,
    watermark: false,
    credits: 2,
    credit_state: "held",
    progress: 0,
    stage: null,
    attempts: 1,
    error: null,
    error_code: null,
    cancel_requested_at: null,
    outputs: [],
    created_at: "2026-10-03T14:02:11Z",
    started_at: null,
    finished_at: null,
    ...job,
  };
}

const JOBS: RenderJob[] = [
  renderJob({
    id: 4813,
    kind: "angle_set",
    status: "running",
    stage: "rendering",
    progress: 0.42,
    spec: { width: 2000, height: 2000, format: "jpeg", frames: 2, output_names: ["ring-front.jpg", "ring-side.jpg"] },
  }),
  renderJob({
    id: 4812,
    status: "completed",
    progress: 1,
    watermark: true,
    credit_state: "charged",
    outputs: [
      {
        id: 991,
        kind: "still",
        label: null,
        filename: "solitaire-4K.png",
        content_type: "image/png",
        bytes: 18_734_211,
        width: 3840,
        height: 2160,
        download_url: "/render-jobs/4812/outputs/991/download",
      },
    ],
  }),
  renderJob({
    id: 4811,
    status: "failed",
    credits: 1,
    credit_state: "refunded",
    error: "The GPU was lost.",
    spec: {
      camera: { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } },
      width: 2560,
      height: 1440,
      format: "png",
      jpeg_quality: 0.95,
      transparent: false,
      frames: 1,
      output_names: ["solitaire-rose-2K.png"],
    },
    look: { material: "gold-18k-rose", lighting: "studio", scene_settings: { customBackground: { type: "image", asset_id: 41 } } },
    variant_id: "variant-rose",
    name: "solitaire-rose-2K",
  }),
];

vi.mock("./useRenderJobList", () => ({
  useRenderJobList: () => ({
    jobs: JOBS,
    loading: false,
    error: null,
    hasMore: true,
    loadingMore: false,
    loadMore: async () => {},
    refresh: () => {},
  }),
}));

const { ExportJobsPanel } = await import("./ExportJobsPanel");

/** The panel's markup, split per job row. */
function rows(): string[] {
  return renderToStaticMarkup(<ExportJobsPanel />).split("<li").slice(1);
}

describe("ExportJobsPanel", () => {
  it("lists every job with what it renders, its status and its cost", () => {
    const [running, completed, failed] = rows();

    expect(running).toContain("ring-front.jpg + 1 more");
    expect(running).toContain("Angle set · 2 files · 2000 × 2000 · JPEG");
    expect(running).toContain("Rendering");
    expect(running).toContain("42%");
    expect(running).toContain("2 credits held");

    expect(completed).toContain("Still · 3840 × 2160 · PNG · watermarked");
    expect(completed).toContain("Ready");
    expect(completed).toContain("2 credits");

    expect(failed).toContain("Failed");
    expect(failed).toContain("The GPU was lost.");
    expect(failed).toContain("1 credit refunded");
  });

  it("downloads a finished job's files through the proxy, and cancels only jobs still going", () => {
    const [running, completed, failed] = rows();

    expect(completed).toContain('href="/api/render-jobs/4812/outputs/991/download"');
    expect(completed).toContain('download="solitaire-4K.png"');
    expect(completed).toContain("18 MB");
    expect(running).not.toContain("/download");
    expect([running, completed, failed].map((row) => />Cancel</.test(row))).toEqual([true, false, false]);
  });

  it("filters every job by status on the Exports page, and not one scene's", () => {
    const page = renderToStaticMarkup(<ExportJobsPanel />);
    const scene = renderToStaticMarkup(<ExportJobsPanel sceneId={812} />);

    for (const label of ["All", "Queued", "Rendering", "Ready", "Failed", "Canceled"]) {
      expect(page).toContain(`>${label}</button>`);
    }
    expect(scene).not.toContain(">All</button>");
    expect(page).toContain("Show older exports");
  });
});

describe("Retry", () => {
  beforeEach(() => {
    drawnButtons.length = 0;
  });
  afterEach(() => vi.restoreAllMocks());

  it("is offered for a failed job only", () => {
    const [running, completed, failed] = rows();

    expect([running, completed, failed].map((row) => />Retry</.test(row))).toEqual([false, false, true]);
  });

  it("asks for the same job again with what it named, its spec less what the API added, and a fresh key", async () => {
    const created = renderJob({ id: 4900, status: "queued" });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify(created), { status: 201 }));
    rows();

    drawnButton("Retry").click();
    drawnButton("Retry").click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    const [[url, init], [, again]] = fetch.mock.calls;
    expect([url, init?.method]).toEqual(["/api/render-jobs", "POST"]);
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "still",
      scene_id: 812,
      variant_id: "variant-rose",
      look: { material: "gold-18k-rose", lighting: "studio", scene_settings: { customBackground: { type: "image", asset_id: 41 } } },
      name: "solitaire-rose-2K",
      spec: {
        camera: { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } },
        width: 2560,
        height: 1440,
        format: "png",
        jpeg_quality: 0.95,
        transparent: false,
      },
    });
    const keys = [init, again].map((call) => new Headers(call?.headers).get("Idempotency-Key"));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
