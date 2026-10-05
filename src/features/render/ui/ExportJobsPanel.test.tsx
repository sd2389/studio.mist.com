import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RenderJob } from "../lib/render-jobs-api";

function renderJob(job: Partial<RenderJob> & Pick<RenderJob, "id" | "status">): RenderJob {
  return {
    kind: "still",
    scene_id: 812,
    batch_id: null,
    spec: { width: 3840, height: 2160, format: "png", frames: 1, output_names: ["solitaire-4K.png"] },
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
  renderJob({ id: 4811, status: "failed", credits: 1, credit_state: "refunded", error: "The GPU was lost." }),
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
