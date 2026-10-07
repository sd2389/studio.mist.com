import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IngestBatch, IngestItem, IngestItemJob, IngestJobOutput } from "@/lib/api/ingest";
import { BatchCounts } from "./BatchCounts";
import { BatchItemList } from "./BatchItemList";

/*
 * A batch's page while its designs render (ADR 0006, "The batch page"): each design's renders
 * with their status, progress and files, its thumbnail and embed link, and the batch's credits
 * held, charged and given back.
 */

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

function output(id: number, label: string | null, filename: string, bytes = 1_800_000): IngestJobOutput {
  return {
    id,
    kind: label ? "still" : "turntable",
    label,
    filename,
    content_type: label ? "image/jpeg" : "video/mp4",
    bytes,
    width: 2000,
    height: 2000,
    download_url: `/render-jobs/0/outputs/${id}/download`,
  };
}

function job(id: number, kind: string, status: IngestItemJob["status"], fields: Partial<IngestItemJob> = {}): IngestItemJob {
  return {
    id,
    kind,
    status,
    progress: status === "completed" ? 1 : 0,
    stage: null,
    attempts: status === "queued" ? 0 : 1,
    max_attempts: 3,
    error: null,
    error_code: null,
    credits: kind === "angle_set" ? 4 : 3,
    credit_state: status === "completed" ? "charged" : status === "failed" ? "refunded" : "held",
    cancel_requested_at: null,
    outputs: [],
    ...fields,
  };
}

function item(id: number, status: IngestItem["status"], fields: Partial<IngestItem> = {}): IngestItem {
  return {
    id,
    batch_id: 31,
    position: id - 1,
    filename: `rings/R-${id}.3dm`,
    bytes: 4_200_000,
    companions: [],
    sku: `R-${id}`,
    name: `Ring ${id}`,
    category: "Ring",
    note: null,
    units: "auto",
    status,
    error: null,
    error_code: null,
    attempts: 0,
    scene_id: 700 + id,
    convert_job_id: 400 + id,
    model_credit_held: 0,
    render_credits_held: 0,
    polygon_count: 680,
    size_mm: 21,
    warnings: [],
    embed_url: `https://studio.mist.com/embed/R-${id}`,
    thumbnail_url: `https://cdn.example.com/published/7/R-${id}/thumbnail.webp`,
    jobs: [],
    created_at: "2026-10-06T09:00:00Z",
    updated_at: "2026-10-06T09:00:00Z",
    ...fields,
  };
}

const STILLS = ["front", "three-quarter", "side", "top"].map((angle, index) => output(991 + index, angle, `R-1-${angle}.jpg`));

const RENDERING = item(1, "rendering", {
  jobs: [
    job(4812, "angle_set", "completed", { outputs: STILLS }),
    job(4813, "turntable", "running", { stage: "encoding", progress: 0.4, attempts: 2 }),
  ],
});
const FAILED = item(2, "failed", {
  error: "The GPU was lost.",
  error_code: "gpu_lost",
  jobs: [job(4814, "angle_set", "completed", { outputs: STILLS }), job(4815, "turntable", "failed", { error: "The GPU was lost.", attempts: 3 })],
});

const BATCH: IngestBatch = {
  id: 31,
  name: "Autumn rings",
  status: "processing",
  source: "studio",
  item_count: 2,
  total_bytes: 8_400_000,
  counts: { rendering: 1, failed: 1 },
  render_plan: null,
  options: {},
  quote: { model_credits: 2, render_credits: 14 },
  held: { model_credits: 0, render_credits: 3 },
  charged: { model_credits: 2, render_credits: 8 },
  refunded: { model_credits: 0, render_credits: 3 },
  created_at: "2026-10-06T09:00:00Z",
  updated_at: "2026-10-06T09:00:00Z",
  submitted_at: "2026-10-06T09:05:00Z",
  finished_at: null,
  expires_at: null,
};

function drawList(items: IngestItem[]): string {
  return renderToStaticMarkup(
    <BatchItemList
      batch={BATCH}
      items={{ items, total: items.length, page: 1, limit: 50 }}
      query={{ status: null, page: 1 }}
      onStatus={() => {}}
      onPage={() => {}}
      onRetry={() => {}}
      pending={null}
      refused={[]}
    />,
  );
}

describe("a design's renders on its batch's page", () => {
  it("shows each job with its status and progress, and every file it made to download", () => {
    const html = drawList([RENDERING]);
    const page = text(html);

    expect(page).toContain("Angle set · 4 images · 4 credits Ready");
    expect(page).toContain("Turntable · try 2 of 3 · 3 credits Encoding");
    expect(page).toContain("40%");
    expect(page).toContain("front · 2 MB three-quarter · 2 MB side · 2 MB top · 2 MB");
    for (const still of STILLS) {
      expect(html).toContain(`href="/api/render-jobs/4812/outputs/${still.id}/download"`);
    }
  });

  it("shows the scene's thumbnail and the piece's embed link to copy", () => {
    const html = drawList([RENDERING]);

    expect(html).toContain('src="https://cdn.example.com/published/7/R-1/thumbnail.webp"');
    expect(text(html)).toContain("Copy embed link");
    expect(html).toContain('title="https://studio.mist.com/embed/R-1"');
    expect(html).toContain('href="/model/701"');
  });

  it("says why a render stopped, and offers the design's retry", () => {
    const page = text(drawList([FAILED]));

    expect(page).toContain("Turntable · try 3 of 3 · 3 credits refunded Failed The GPU was lost.");
    expect(page).toContain("Retry");
  });
});

describe("the batch's credits", () => {
  it("shows the price, what is held now, what was charged and what was given back", () => {
    const page = text(renderToStaticMarkup(<BatchCounts batch={BATCH} />));

    expect(page).toContain("Price 2 model credits and 14 render credits · held now 0 model credits and 3 render credits");
    expect(page).toContain("Charged 2 model credits and 8 render credits · given back 0 model credits and 3 render credits");
  });
});
