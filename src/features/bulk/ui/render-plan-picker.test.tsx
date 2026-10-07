import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RenderPlan, RenderPlanQuote } from "@/lib/api/ingest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import { DEFAULT_RENDER_PLAN, DEFAULT_SPIN } from "../domain/render-plan";
import { BatchPlanPanel } from "./BatchPlanPanel";
import { RenderPlanPicker } from "./RenderPlanPicker";
import type { RenderPlanChoice } from "./useRenderPlanChoice";

/*
 * The render plan on /bulk/new (ADR 0006, "Render plans"): the ADR's default picked to start
 * with the Campaign Pack's pickers, priced by the API (a design and the batch), and the price in
 * the batch's total with the balance it leaves.
 */

const QUOTE: RenderPlanQuote = {
  render_credits: 7,
  jobs: [
    { kind: "angle_set", credits: 4, files: 4 },
    { kind: "turntable", credits: 3, files: 1 },
  ],
};

function choice(plan: RenderPlan, fields: Partial<RenderPlanChoice> = {}): RenderPlanChoice {
  return {
    plan,
    setPlan: () => {},
    body: plan,
    quote: QUOTE,
    error: null,
    pending: false,
    perDesign: QUOTE.render_credits,
    refused: false,
    ...fields,
  };
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

/** The labels of the chips drawn picked. */
function pressed(html: string): string[] {
  return [...html.matchAll(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/g)].map((match) => text(match[1]!).trim());
}

/** Whether the switch of this id is drawn on: its checkbox, which the switch keeps in step, is checked. */
function switchedOn(html: string, id: string): boolean {
  const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
  if (!input) throw new Error(`No switch ${id}`);
  return input.includes('checked=""');
}

describe("the render plan picker", () => {
  it("starts on the ADR's default plan: four 2000 px stills and a 6 s turntable, private", () => {
    const html = renderToStaticMarkup(<RenderPlanPicker choice={choice(DEFAULT_RENDER_PLAN)} designCount={3} />);
    const on = pressed(html);

    expect(on).toEqual(expect.arrayContaining(["Front", "Three-quarter hero", "Top", "Side", "2000×2000", "1:1 · 1080×1080", "6 s", "30 fps"]));
    expect(on).not.toContain("PNG");
    expect(text(html)).toContain("the front one becomes the thumbnail");
    expect(text(html)).toContain("360° turntable MP4 · 6s");
    expect(["render-plan-turntable", "render-plan-spin", "render-plan-publish"].map((id) => switchedOn(html, id))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("shows the API's price for a design and for the batch, job by job", () => {
    const page = text(renderToStaticMarkup(<RenderPlanPicker choice={choice(DEFAULT_RENDER_PLAN)} designCount={3} />));

    expect(page).toContain("7 credits a design · 21 credits for 3 designs");
    expect(page).toContain("Angle set 4 · Turntable 3");
  });

  it("says a plan past the plan's caps needs an upgrade, as the API's 402 does", () => {
    const refused = new AuthRequestError("Video length limit exceeded for Grow (max 20 s at 8K).", 402);
    const html = renderToStaticMarkup(
      <RenderPlanPicker choice={choice(DEFAULT_RENDER_PLAN, { quote: null, error: refused, refused: true })} designCount={3} />,
    );

    expect(text(html)).toContain("Video length limit exceeded for Grow (max 20 s at 8K). Upgrade");
    expect(html).toContain('href="/pricing"');
  });

  it("prices nothing for a plan that renders nothing, and draws a spin's switch on when picked", () => {
    const none: RenderPlan = { stills: null, turntable: null, spin: null, publish_media: false, thumbnail_from: null };
    const withSpin = { ...DEFAULT_RENDER_PLAN, spin: DEFAULT_SPIN };

    expect(text(renderToStaticMarkup(<RenderPlanPicker choice={choice(none, { body: null, quote: null, perDesign: 0 })} designCount={3} />))).toContain(
      "Renders nothing: each design is only converted.",
    );
    expect(switchedOn(renderToStaticMarkup(<RenderPlanPicker choice={choice(withSpin)} designCount={3} />), "render-plan-spin")).toBe(true);
  });
});

describe("the batch's price", () => {
  const billing = {
    plan_label: "Studio",
    balances: { model_credits: 480, render_credits: 10 },
    features: { bulk_upload: { max_designs: 500, max_bytes: 20 * 1024 ** 3, max_file_bytes: 100 * 1024 ** 2, max_open_batches: 3 } },
  } as unknown as UserBillingSnapshot;

  it("adds the render plan's credits for every design, and says when the balance is short", () => {
    const page = text(
      renderToStaticMarkup(<BatchPlanPanel billing={billing} designCount={3} bytes={3000} quote={null} renderCreditsPerDesign={7} />),
    );

    expect(page).toContain("3 model credits · one a design");
    expect(page).toContain("21 render credits · the render plan's");
    expect(page).toContain("You have 480 model credits; 477 left after this batch.");
    expect(page).toContain("Submitting it needs 11 render credits more than you have. Upgrade");
  });

  it("waits for the API's price", () => {
    const page = text(
      renderToStaticMarkup(<BatchPlanPanel billing={billing} designCount={3} bytes={3000} quote={null} renderCreditsPerDesign={null} />),
    );

    expect(page).toContain("Render credits: pricing…");
  });
});
