import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LookTemplate } from "@/lib/api/ingest";
import type { LookTemplates } from "./useLookTemplates";

/*
 * The bulk upload's look picker (ADR 0006 F1): the studio's default or one of the user's look
 * templates, each drawn in the designer's swatch style by role, and "Use the look of…" a scene.
 * The page only picks: the batch request names the template, and the API checks and applies it.
 */

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
let apiFlags: Record<string, boolean> = {};

// The real relay; only the API is stubbed, `/features` included.
vi.mock("@/lib/auth/upstream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/upstream")>()),
  upstreamFetch: (path: string, init?: RequestInit) =>
    path === "/features" ? Promise.resolve(Response.json({ flags: apiFlags })) : upstreamFetch(path, init),
}));

const { lookTemplateFromScene } = await import("@/lib/api/ingest");
const fromSceneRoute = await import("@/app/api/ingest/look-templates/from-scene/[sceneId]/route");
const { batchCreateBody } = await import("../domain/batch-request");
const { templateSwatches, withTemplateFirst } = await import("../domain/look-templates");
const { LookTemplatePicker } = await import("./LookTemplatePicker");

const NO_ITEMS = { environments: [], backgrounds: [], grounds: [], metals: [], gems: [], user_materials: [] };

function template(id: number, name: string, fields: Partial<LookTemplate["template"]> = {}, labels: Record<string, string> = {}): LookTemplate {
  return {
    id,
    name,
    source_scene_id: id + 100,
    template: { lighting: "studio", finish: "polished", materials: {}, slot_materials: {}, scene_settings: {}, ...fields },
    labels,
    look: NO_ITEMS,
    created_at: "2026-10-06T09:00:00Z",
    updated_at: "2026-10-06T09:00:00Z",
  };
}

// A template of a two-tone solitaire: a yellow band, its head in white gold, a diamond.
const TWO_TONE = template(
  12,
  "Look of Two-tone solitaire",
  { lighting: "catalog", materials: { metal: "gold-18k-yellow", gem: "diamond" }, slot_materials: { metal: { Heads: "gold-18k-white" } } },
  { "gold-18k-yellow": "18K Yellow", "gold-18k-white": "18K White", diamond: "Diamond" },
);
const HALO = template(
  14,
  "Look of Halo",
  { materials: { metal: "platinum", gem: "sapphire", accent: "diamond" } },
  { platinum: "Platinum", sapphire: "Sapphire", diamond: "Diamond" },
);

function looksOf(templates: LookTemplate[], selectedId: number | null): LookTemplates {
  return { templates, selectedId, select: () => {}, making: false, error: null, makeFromScene: async () => true };
}

/** Markup as the text a reader sees. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Each look option: whether it is checked and disabled, and what it says. */
function options(html: string): { checked: boolean; disabled: boolean; text: string }[] {
  return [...html.matchAll(/<button[^>]*role="radio"[^>]*>([\s\S]*?)<\/button>/g)].map(([whole, inner]) => ({
    checked: whole.includes('aria-checked="true"'),
    disabled: /\sdisabled=""/.test(whole.slice(0, whole.indexOf(">"))),
    text: text(inner!).trim(),
  }));
}

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function sceneParams(sceneId: string) {
  return { params: Promise.resolve({ sceneId }) };
}

afterEach(() => {
  upstreamFetch.mockReset();
  apiFlags = {};
  vi.restoreAllMocks();
});

describe("the look picker", () => {
  it("offers the studio's default and each template, its materials by role in the swatch style", () => {
    const html = renderToStaticMarkup(<LookTemplatePicker looks={looksOf([TWO_TONE, HALO], 12)} disabled={false} />);

    expect(options(html)).toEqual([
      { checked: false, disabled: false, text: "Studio default Each design keeps the materials its file suggests." },
      { checked: true, disabled: false, text: "Look of Two-tone solitaire Metal 18K Yellow Heads 18K White Gem Diamond" },
      // Platinum's band carries its PT stamp, as in the designer.
      { checked: false, disabled: false, text: "Look of Halo Metal PT Platinum Gem Sapphire Accent Diamond" },
    ]);
    expect(html).toContain('role="radiogroup" aria-label="Look"');
    // The swatches are the studio's own, shown rather than picked: no buttons inside the option.
    expect(html).toContain('title="18K White"');
    expect(text(html)).toContain("Use the look of…");
  });

  it("picks the studio's default until a template is chosen, and nothing once the batch is made", () => {
    const fresh = options(renderToStaticMarkup(<LookTemplatePicker looks={looksOf([TWO_TONE], null)} disabled={false} />));
    const made = renderToStaticMarkup(<LookTemplatePicker looks={looksOf([TWO_TONE], 12)} disabled />);

    expect(fresh.map((option) => option.checked)).toEqual([true, false]);
    expect(options(made).every((option) => option.disabled)).toBe(true);
    expect(made).toMatch(/<button[^>]*disabled=""[^>]*>Use the look of…<\/button>/);
  });

  it("says what went wrong making a template", () => {
    const looks = { ...looksOf([], null), error: "This scene's look can't be a template: look_template.materials.metal: catalog:old-gold is not in the catalogue" };

    expect(text(renderToStaticMarkup(<LookTemplatePicker looks={looks} disabled={false} />))).toContain(
      "This scene's look can't be a template: look_template.materials.metal: catalog:old-gold is not in the catalogue",
    );
  });

  it("lists a template's swatches role by role, a slot's own after its role's", () => {
    expect(templateSwatches(TWO_TONE).map(({ key, caption, material, label }) => [key, caption, material, label])).toEqual([
      ["metal", "Metal", "gold-18k-yellow", "18K Yellow"],
      ["metal:Heads", "Heads", "gold-18k-white", "18K White"],
      ["gem", "Gem", "diamond", "Diamond"],
    ]);
    expect(templateSwatches(template(3, "Lighting only"))).toEqual([]);
  });

  it("puts a template just made first, in place of its older copy", () => {
    const remade = { ...TWO_TONE, name: "Look of Two-tone solitaire (new)" };

    expect(withTemplateFirst([HALO, TWO_TONE], remade).map(({ id, name }) => [id, name])).toEqual([
      [12, "Look of Two-tone solitaire (new)"],
      [14, "Look of Halo"],
    ]);
  });
});

describe("the picker's request", () => {
  it("names the template picked in the batch request, and none for the studio's default", () => {
    const choices = { name: " Autumn rings ", manifest: null, defaultCategory: "Ring" };

    expect(batchCreateBody([], { ...choices, lookTemplateId: 12 })).toEqual({
      name: "Autumn rings",
      items: [],
      manifest: null,
      look_template_id: 12,
      options: { default_category: "Ring" },
    });
    expect(batchCreateBody([], { ...choices, lookTemplateId: null })).not.toHaveProperty("look_template_id");
  });

  it("makes a template of a scene's look through its proxy, and says why the API refused one", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => answer(TWO_TONE, 201))
      .mockImplementationOnce(async () => answer({ error: "Scene not found" }, 404));

    const made = await lookTemplateFromScene(7);
    const refused = await lookTemplateFromScene(8).catch((error: unknown) => error);

    expect(made).toEqual(TWO_TONE);
    expect(fetch.mock.calls.map(([url, init]) => [init?.method, url, init?.body])).toEqual([
      ["POST", "/api/ingest/look-templates/from-scene/7", "{}"],
      ["POST", "/api/ingest/look-templates/from-scene/8", "{}"],
    ]);
    expect(refused).toMatchObject({ status: 404, message: "Scene not found" });
  });

  it("is passed on to the API as the user, with its status, while bulk_pipeline is on", async () => {
    apiFlags = { bulk_pipeline: true };
    upstreamFetch.mockResolvedValueOnce(answer(TWO_TONE, 201)).mockResolvedValueOnce(answer(TWO_TONE, 200));
    const request = () => new Request("http://studio.test/api/ingest/look-templates/from-scene/7", { method: "POST", body: "{}" });

    const made = await fromSceneRoute.POST(request(), sceneParams("7"));
    const remade = await fromSceneRoute.POST(request(), sceneParams("7"));

    expect([made.status, remade.status]).toEqual([201, 200]);
    expect(await made.json()).toEqual(TWO_TONE);
    expect(upstreamFetch.mock.calls.map(([path, init]) => [init?.method, path, init?.body ?? null])).toEqual([
      ["POST", "/ingest/look-templates/from-scene/7", null],
      ["POST", "/ingest/look-templates/from-scene/7", null],
    ]);
  });

  it("refuses a scene id that isn't one, and isn't there while bulk_pipeline is off", async () => {
    const request = new Request("http://studio.test/x", { method: "POST" });

    apiFlags = { bulk_pipeline: true };
    const bad = await fromSceneRoute.POST(request, sceneParams("abc"));
    apiFlags = { bulk_pipeline: false };
    const off = await fromSceneRoute.POST(request, sceneParams("7"));

    expect([bad.status, off.status]).toEqual([400, 404]);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
