import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestArchive, IngestBatch, IngestItemJob } from "@/lib/api/ingest";
import { isBatchFollowed } from "../domain/statuses";
import { BatchResults } from "./BatchResults";

/*
 * A batch's results on its page (ADR 0006, "Results"): the manifest to download, the ZIP built on
 * the server with its job's status and progress and a download for each part, and how long the
 * batch keeps its files.
 */

const NOW = new Date("2026-10-07T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
}

function archiveJob(status: IngestItemJob["status"], fields: Partial<IngestItemJob> = {}): IngestItemJob {
  return {
    id: 5120,
    kind: "batch_archive",
    status,
    progress: status === "completed" ? 1 : 0,
    stage: null,
    attempts: 1,
    max_attempts: 3,
    error: null,
    error_code: null,
    credits: 0,
    credit_state: "none",
    cancel_requested_at: null,
    outputs: [],
    ...fields,
  };
}

const READY: IngestArchive = {
  job: archiveJob("completed"),
  parts: [
    { part: 1, name: "Autumn-rings-part-1.zip", bytes: 2_000_000_000, files: 812, download_url: "/ingest/batches/31/archive/1" },
    { part: 2, name: "Autumn-rings-part-2.zip", bytes: 640_000_000, files: 401, download_url: "/ingest/batches/31/archive/2" },
  ],
  made_at: at(0),
  expires_at: at(14),
};

function batch(fields: Partial<IngestBatch> = {}): IngestBatch {
  return {
    id: 31,
    name: "Autumn rings",
    status: "completed",
    source: "studio",
    item_count: 200,
    total_bytes: 840_000_000,
    counts: { done: 200 },
    render_plan: null,
    look_template: null,
    options: {},
    quote: { model_credits: 200, render_credits: 1400 },
    held: { model_credits: 0, render_credits: 0 },
    created_at: at(-1),
    updated_at: at(0),
    submitted_at: at(-1),
    finished_at: at(0),
    expires_at: at(30),
    sources_deleted_at: null,
    archive: null,
    ...fields,
  };
}

function draw(shown: IngestBatch, { canBuild = true, starting = false } = {}): string {
  return renderToStaticMarkup(<BatchResults batch={shown} canBuild={canBuild} starting={starting} onBuild={() => {}} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a batch's results", () => {
  it("offers the manifest at once and a ZIP of every file once the batch has finished", () => {
    const html = draw(batch());
    const page = text(html);

    expect(hrefs(html)).toEqual(["/api/ingest/batches/31/manifest.csv"]);
    expect(page).toContain("Download the manifest (CSV)");
    expect(page).toContain("Its links open for you when you're signed in: the plan keeps media private.");
    expect(page).toContain("Build a ZIP of every file");
    expect(page).toContain("Its CAD files are deleted next month, 30 days after the batch finished.");
  });

  it("says the manifest's links are public when the plan publishes media", () => {
    const plan = { stills: null, turntable: null, spin: null, publish_media: true, thumbnail_from: null };

    expect(text(draw(batch({ render_plan: plan })))).toContain("Its links are public: the plan publishes each design's media.");
  });

  it("builds no ZIP while the batch processes, or with bulk uploads switched off", () => {
    const processing = text(draw(batch({ status: "processing", finished_at: null, expires_at: null })));
    expect(processing).not.toContain("Build a ZIP");
    expect(processing).toContain("A ZIP of every file can be built once the batch has finished.");

    expect(text(draw(batch(), { canBuild: false }))).not.toContain("Build a ZIP");
  });

  it("follows the ZIP as it builds, its button held meanwhile", () => {
    const building = batch({ archive: { job: archiveJob("running", { stage: "uploading", progress: 0.42 }), parts: [], made_at: null, expires_at: null } });
    const html = draw(building);
    const page = text(html);

    expect(page).toContain("ZIP Uploading");
    expect(html).toContain('aria-label="Render progress"');
    expect(page).toContain("42%");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Build a ZIP of every file/);
    expect(isBatchFollowed(building)).toBe(true);
    expect(isBatchFollowed(batch({ archive: READY }))).toBe(false);
    expect(isBatchFollowed(batch({ status: "processing" }))).toBe(true);
  });

  it("downloads each part of a ready ZIP through its own link, and says when it goes", () => {
    const html = draw(batch({ archive: READY }));
    const page = text(html);

    expect(hrefs(html)).toEqual([
      "/api/ingest/batches/31/manifest.csv",
      "/api/ingest/batches/31/archive/1",
      "/api/ingest/batches/31/archive/2",
    ]);
    expect(page).toContain("ZIP · 2 parts · 1,213 files Ready");
    expect(page).toContain("Part 1 · 1.9 GB");
    expect(page).toContain("Part 2 · 610 MB");
    expect(html).toContain('download="Autumn-rings-part-2.zip"');
    expect(page).toContain("Build the ZIP again");
    expect(page).toContain("The ZIP is deleted in 2 weeks, 14 days after it was made; build it again any time.");
  });

  it("says why a ZIP wasn't built, and keeps the parts of the one before", () => {
    const html = draw(batch({ archive: { ...READY, job: archiveJob("failed", { error: "R-7/video/turntable.mp4 could not be read: 404" }) } }));
    const page = text(html);

    expect(page).toContain("ZIP · 2 parts · 1,213 files Failed");
    expect(page).toContain("R-7/video/turntable.mp4 could not be read: 404");
    expect(hrefs(html)).toContain("/api/ingest/batches/31/archive/1");
  });

  it("says when the batch's CAD files went, or that they are going", () => {
    expect(text(draw(batch({ sources_deleted_at: at(-2), expires_at: at(-3) })))).toContain(
      "Its CAD files were deleted 2 days ago: failed designs can no longer convert again.",
    );
    expect(text(draw(batch({ expires_at: at(-1) })))).toContain("are being deleted: failed designs can no longer convert again.");
  });
});
