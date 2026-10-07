import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchView, IngestBatchStatus, IngestItem } from "@/lib/api/ingest";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import type { DroppedFile } from "@/lib/upload/dropped-files";

/*
 * The bulk pages behind the bulk_pipeline flag (ADR 0006 E3), drawn on the server as Next draws
 * them: no entry point and no /bulk/new while it is off; a batch's page can still be read and
 * canceled then, as the API allows, but offers no work.
 */

const flags = vi.hoisted(() => ({ value: {} as Record<string, boolean> }));
const server = vi.hoisted(() => ({ view: null as unknown, recent: [] as unknown[], billing: null as unknown, templates: [] as unknown[] }));
const NOT_FOUND = vi.hoisted(() => new Error("NEXT_NOT_FOUND"));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {} }),
}));
vi.mock("@/lib/auth/require-page-user", () => ({
  requirePageUser: async () => ({ id: 7, email: "studio@example.com", role: "user" }),
}));
vi.mock("@/lib/feature-flags/server-fetch", async () => {
  const { isFeatureEnabled } = await import("@/lib/feature-flags/is-enabled");
  return {
    isFeatureEnabled,
    fetchFeatureFlagsServer: async () => ({ flags: flags.value }),
    isFeatureEnabledServer: async (key: "bulk_pipeline") => isFeatureEnabled({ flags: flags.value }, key),
  };
});
vi.mock("@/lib/billing/server-fetch", () => ({ fetchBillingAccountServer: async () => server.billing }));
vi.mock("@/lib/api/ingest-server", () => ({
  fetchRecentBatchesServer: async () => server.recent,
  fetchBatchViewServer: async () => server.view,
  fetchLookTemplatesServer: async () => server.templates,
}));
vi.mock("@/components/dashboard/DashboardClient", () => ({ DashboardClient: () => null }));

const BulkUploadPage = (await import("@/app/bulk/new/page")).default;
const BatchPage = (await import("@/app/bulk/[id]/page")).default;
const { DashboardShell } = await import("@/components/dashboard/DashboardShell");
const { createBatch, batchProblems } = await import("@/lib/api/ingest");
const { sortProblems } = await import("../domain/batch-request");
const { planDesigns } = await import("../domain/design-checks");
const { groupDesignFiles } = await import("../domain/design-files");
const { parseManifest } = await import("../domain/manifest");
const { PIPELINE_NOTE } = await import("../domain/statuses");
const { BulkDropPanel } = await import("./BulkDropPanel");
const { BulkUploadActions } = await import("./BulkUploadActions");
const { DesignList } = await import("./DesignList");

const MB = 1024 ** 2;
const GB = 1024 ** 3;

/** Markup as the text a reader sees. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function billing(tier: "free" | "studio"): UserBillingSnapshot {
  const studio = tier === "studio";
  const balances = {
    model_credits: studio ? 480 : 3,
    ai_image_credits: 0,
    render_credits: 0,
    custom_material_credits: 0,
    custom_asset_credits: 0,
    storage_bytes_used: 0,
    storage_bytes_limit: 0,
  };
  return {
    plan_tier: tier,
    plan_label: studio ? "Studio" : "Free",
    period_start: null,
    period_end: null,
    balances,
    allotments: balances,
    features: {
      max_variants_per_model: 3,
      max_image_resolution: 8192,
      max_polygons: 2_000_000,
      watermark_exports: !studio,
      embed_enabled: true,
      batch_export_enabled: studio,
      video_8k_enabled: studio,
      max_video_fps: studio ? 60 : 30,
      max_video_seconds: studio ? 60 : 10,
      max_8k_video_seconds: studio ? 20 : 0,
      bulk_upload: studio
        ? { max_designs: 500, max_bytes: 20 * GB, max_file_bytes: 100 * MB, max_open_batches: 3 }
        : { max_designs: 0, max_bytes: 0, max_file_bytes: 100 * MB, max_open_batches: 3 },
    },
    stripe_customer_id: null,
    has_active_subscription: studio,
  };
}

function item(id: number, status: IngestItem["status"], fields: Partial<IngestItem> = {}): IngestItem {
  return {
    id,
    batch_id: 31,
    position: id - 9001,
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
    scene_id: null,
    convert_job_id: null,
    model_credit_held: status === "converting" ? 1 : 0,
    render_credits_held: 0,
    polygon_count: null,
    size_mm: null,
    warnings: [],
    created_at: "2026-10-06T09:00:00Z",
    updated_at: "2026-10-06T09:00:00Z",
    ...fields,
  };
}

function batchView(status: IngestBatchStatus, items: IngestItem[]): BatchView {
  const counts: Record<string, number> = {};
  for (const one of items) counts[one.status] = (counts[one.status] ?? 0) + 1;
  return {
    batch: {
      id: 31,
      name: "Autumn rings",
      status,
      source: "studio",
      item_count: items.length,
      total_bytes: items.length * 4_200_000,
      counts,
      render_plan: null,
      look_template: null,
      options: { decimate: "auto", default_category: "Ring" },
      quote: { model_credits: items.length, render_credits: 0 },
      held: { model_credits: counts.converting ?? 0, render_credits: 0 },
      created_at: "2026-10-06T09:00:00Z",
      updated_at: "2026-10-06T09:00:00Z",
      submitted_at: status === "draft" ? null : "2026-10-06T09:05:00Z",
      finished_at: null,
      expires_at: null,
    },
    items: { items, total: items.length, page: 1, limit: 50 },
  };
}

const PROCESSING = batchView("processing", [
  item(9001, "converting"),
  item(9002, "failed", { error: "R-9002: stones alone are 2.4M triangles", error_code: "over_polygon_cap" }),
  item(9003, "failed", { error_code: "model_unreadable" }),
  item(9004, "awaiting_upload"),
]);

async function drawBatchPage(view: BatchView): Promise<string> {
  server.view = view;
  return renderToStaticMarkup(await BatchPage({ params: Promise.resolve({ id: "31" }) }));
}

afterEach(() => {
  flags.value = {};
  server.view = null;
  server.recent = [];
  server.billing = null;
  server.templates = [];
  vi.restoreAllMocks();
});

describe("with bulk_pipeline off", () => {
  it("has no bulk upload page, the flag's default too", async () => {
    await expect(BulkUploadPage()).rejects.toBe(NOT_FOUND);
    flags.value = { bulk_pipeline: false };
    await expect(BulkUploadPage()).rejects.toBe(NOT_FOUND);
  });

  it("links no bulk upload from the dashboard", () => {
    const shell = (showBulkUpload: boolean) =>
      renderToStaticMarkup(
        <DashboardShell
          initialScenes={[]}
          initialError={null}
          filters={{ q: "", category: "", page: 1, limit: 12 } as never}
          filterResult={{ items: [], total: 0, page: 1, pageCount: 1 } as never}
          allSceneCount={0}
          initialBilling={null}
          showBulkUpload={showBulkUpload}
        />,
      );

    expect(shell(false)).not.toContain('href="/bulk/new"');
    expect(shell(true)).toContain('href="/bulk/new"');
  });

  it.each([
    ["bulk_pipeline off", { bulk_pipeline: false }],
    // The API's _adds_work takes both switches: with uploads paused it refuses every retry too.
    ["uploads paused", { bulk_pipeline: true, upload: false }],
  ])("lets a batch be followed and canceled for its credits, and offers no work, with %s", async (_, value) => {
    flags.value = value;
    const html = await drawBatchPage(PROCESSING);
    const page = text(html);

    expect(page).toContain("Bulk uploads are switched off for now.");
    expect(page).toContain("Cancel batch");
    expect(page).not.toContain("Retry");
    expect(page).not.toContain("Drop the files again");
    expect(html).not.toContain('href="/bulk/new"');
  });
});

describe("with bulk_pipeline on", () => {
  it("shows the drop, the look, the plan's limits, the price and the recent batches", async () => {
    flags.value = { bulk_pipeline: true };
    server.billing = billing("studio");
    server.recent = [PROCESSING.batch];
    server.templates = [
      {
        id: 12,
        name: "Look of Two-tone solitaire",
        source_scene_id: 7,
        template: { lighting: "catalog", finish: "satin", materials: { metal: "gold-18k-yellow" }, slot_materials: {}, scene_settings: {} },
        labels: { "gold-18k-yellow": "18K Yellow" },
        look: { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] },
        created_at: "2026-10-06T09:00:00Z",
        updated_at: "2026-10-06T09:00:00Z",
      },
    ];
    const html = renderToStaticMarkup(await BulkUploadPage());
    const page = text(html);

    expect(page).toContain("Drop CAD files, a folder or a ZIP");
    expect(page).toContain("Look Studio default Each design keeps the materials its file suggests. Look of Two-tone solitaire Metal 18K Yellow");
    expect(page).toContain("Use the look of…");
    expect(page).toContain("Studio: up to 500 designs and 20 GB a batch, 100 MB a file, 3 batches open at once.");
    expect(page).toContain("0 model credits · one a design");
    expect(page).toContain("Drop the designs to upload first.");
    expect(html).toContain('href="/bulk/31"');
    expect(page).toContain("4 designs · 1 awaiting upload · 1 converting · 2 failed");
  });

  it("says Free has no bulk upload, with an upgrade link, as the API's 402 does", async () => {
    flags.value = { bulk_pipeline: true };
    server.billing = billing("free");
    const html = renderToStaticMarkup(await BulkUploadPage());

    expect(text(html)).toContain("Bulk upload is part of Grow and Studio, not Free. Upgrade");
    expect(html).toContain('href="/pricing"');
  });

  it("pauses with uploads switched off", async () => {
    flags.value = { bulk_pipeline: true, upload: false };
    expect(text(renderToStaticMarkup(await BulkUploadPage()))).toContain("Uploads paused");
  });

  it("shows a batch's counts, each design's status and why it failed, and how its designs move on", async () => {
    flags.value = { bulk_pipeline: true };
    const page = text(await drawBatchPage(PROCESSING));

    expect(page).toContain("Autumn rings");
    // In pipeline order, each a GROUP BY count from the API.
    expect(page).toContain("Awaiting upload 1 Converting 1 Failed 2");
    expect(page).toContain("2 of 4 designs finished");
    expect(page).toContain("Price 4 model credits and 0 render credits · held now 1 model credit and 0 render credits");
    expect(page).toContain(PIPELINE_NOTE);
    expect(page).toContain("Queued for conversion on our servers.");
    expect(page).toContain("R-9002: stones alone are 2.4M triangles");
    expect(page).toContain("Its file couldn't be read as a model.");
  });

  it("offers retries, the uploads to finish and a cancel asked first", async () => {
    flags.value = { bulk_pipeline: true };
    const html = await drawBatchPage(PROCESSING);
    const rows = html.split("<li").slice(1);

    expect(text(html)).toContain("Retry the 2 failed");
    expect(rows.map((row) => />Retry</.test(row))).toEqual([false, true, true, false]);
    expect(text(html)).toContain("1 design is waiting for its file.");
    expect(text(html)).toContain("Drop the files again");
    expect(text(html)).toContain("Cancel batch");
    // The confirmation is drawn only once Cancel batch is pressed.
    expect(text(html)).not.toContain("Cancel the batch");
  });

  it("submits a draft by hand, and has no page for a batch that isn't the user's", async () => {
    flags.value = { bulk_pipeline: true };
    expect(text(await drawBatchPage(batchView("draft", [item(9001, "uploaded")])))).toContain("Submit the batch");

    server.view = null;
    await expect(BatchPage({ params: Promise.resolve({ id: "31" }) })).rejects.toBe(NOT_FOUND);
    await expect(BatchPage({ params: Promise.resolve({ id: "abc" }) })).rejects.toBe(NOT_FOUND);
  });
});

describe("a refused batch's problems", () => {
  const MANIFEST = "file,sku,name\nrings/R-1001.3dm,R-1001,Solitaire\nP-220.stp,P-220,Halo\ngone.3dm,G-1,Gone\n";
  const files: DroppedFile[] = ["rings/R-1001.3dm", "P-220.stp"].map((path) => ({ path, file: new File(["x"], path) }));

  it("show on the design and the CSV row they are about, as the API's 422 names them", async () => {
    const plan = planDesigns(groupDesignFiles(files).designs, parseManifest(MANIFEST), "Ring", 100 * MB);
    const local = sortProblems(plan.problems);
    // The checks before the API already find the row naming no dropped file.
    expect(local.manifest.map(({ row, code }) => [row, code])).toEqual([[4, "file_not_in_batch"]]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json(
        {
          error: "The batch has 2 problems; nothing was made.",
          problems: [
            { item: null, row: 4, field: "file", code: "file_not_in_batch", message: "No file of the batch is gone.3dm." },
            { item: 1, row: 2, field: "sku", code: "sku_taken", message: "R-1001 is a scene's SKU already." },
          ],
        },
        { status: 422 },
      ),
    );
    const refused = await createBatch({ name: "Autumn rings", items: [] }).catch((error: unknown) => error);
    const sorted = sortProblems(batchProblems(refused));

    const list = renderToStaticMarkup(<DesignList designs={plan.designs} problems={sorted.byDesign} />);
    const [halo, solitaire] = list.split('<li class="rounded-xl').slice(1).map(text);
    expect(halo).toContain("P-220.stp");
    expect(halo).toContain("Ready");
    expect(solitaire).toContain("rings/R-1001.3dm");
    expect(solitaire).toContain("R-1001 · Solitaire · Ring");
    expect(solitaire).toContain("1 problem");
    expect(solitaire).toContain("Row 2: R-1001 is a scene's SKU already.");

    const drop = {
      grouped: { designs: [], manifests: [], leftOut: [{ file: { path: "notes.pdf" }, reason: "Not a CAD file" }] },
      manifest: { name: "manifest.csv", text: MANIFEST },
      parsedManifest: parseManifest(MANIFEST),
      notes: ["old.zip couldn't be opened: invalid zip data"],
      reading: false,
    } as never;
    const panel = text(renderToStaticMarkup(<BulkDropPanel drop={drop} manifestProblems={sorted.manifest} disabled={false} />));
    expect(panel).toContain("manifest.csv · 3 rows");
    expect(panel).toContain("Row 4: No file of the batch is gone.3dm.");
    expect(panel).toContain("old.zip couldn't be opened: invalid zip data");
    expect(panel).toContain("1 file left out");
  });

  it("leave the request free to be tried again, once what the API found is fixed elsewhere", () => {
    const flow = {
      phase: "planning",
      batch: null,
      refusedBody: true,
      refusal: null,
      error: null,
      uploads: { totals: { sent: 0, total: 0, confirmed: 0, failed: 0, designs: 0 } },
      start: () => {},
    } as never;
    const refused = renderToStaticMarkup(<BulkUploadActions flow={flow} designCount={3} blocked={null} />);
    const blocked = renderToStaticMarkup(<BulkUploadActions flow={flow} designCount={3} blocked="Checking the SKUs…" />);
    const disabled = (html: string) => /<button[^>]*\sdisabled=""/.test(html);

    expect(text(refused)).toContain("Nothing was made: the batch has the problems shown above.");
    expect(disabled(refused)).toBe(false);
    expect(disabled(blocked)).toBe(true);
  });
});
