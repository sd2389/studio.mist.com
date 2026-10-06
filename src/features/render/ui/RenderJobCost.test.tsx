import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import type { RenderJobBulkQuote, RenderJobQuote } from "../lib/render-jobs-api";
import { RenderJobCost, RenderJobError } from "./RenderJobCost";

const QUOTE: RenderJobQuote = {
  credits: 2,
  width: 3840,
  height: 2160,
  frames: 1,
  outputs: ["solitaire-4K.png"],
  watermark: true,
  warnings: ["This needs 2 render credits and 1 are left."],
};

describe("RenderJobCost", () => {
  it("shows the quoted credits and the API's warnings", () => {
    const html = renderToStaticMarkup(<RenderJobCost quote={QUOTE} error={null} pending={false} />);

    expect(html).toContain("Costs <span");
    expect(html).toContain("2 credits");
    expect(html).toContain("watermarked");
    expect(html).toContain("This needs 2 render credits and 1 are left.");
  });

  it("offers an upgrade when the plan can't render the request", () => {
    const error = new AuthRequestError("Resolution limit exceeded for Free (max 4096 px per side).", 402);
    const html = renderToStaticMarkup(<RenderJobCost quote={null} error={error} pending={false} />);

    expect(html).toContain("Resolution limit exceeded for Free (max 4096 px per side).");
    expect(html).toContain('href="/pricing"');
  });

  it("says it is pricing until the quote is in, and nothing when there is nothing to price", () => {
    expect(renderToStaticMarkup(<RenderJobCost quote={null} error={null} pending />)).toContain("Pricing…");
    expect(renderToStaticMarkup(<RenderJobCost quote={null} error={null} pending={false} />)).toBe("");
  });
});

describe("RenderJobCost for a bulk request", () => {
  const still: RenderJobQuote = { ...QUOTE, warnings: [] };

  it("shows the total for the images that can be made, and why the others can't", () => {
    const bulk: RenderJobBulkQuote = {
      credits: 4,
      items: [
        { quote: still, refused: null },
        { quote: still, refused: null },
        { quote: null, refused: { status: 404, detail: "Variant not found" } },
      ],
      refused: null,
      warnings: ["This needs 4 render credits and 3 are left."],
    };
    const html = renderToStaticMarkup(<RenderJobCost quote={bulk} error={null} pending={false} />);

    expect(html).toContain("4 credits");
    expect(html).toContain("for 2 images");
    expect(html).toContain("watermarked");
    expect(html).toContain("This needs 4 render credits and 3 are left.");
    expect(html).toContain("1 of 3 can&#x27;t be rendered: Variant not found");
  });

  it("counts a bulk request of turntables in videos, one a job, not in frames", () => {
    const turntable: RenderJobQuote = { ...still, credits: 3, width: 1920, height: 1080, frames: 120, outputs: ["ring-live-360.mp4"] };
    const bulk: RenderJobBulkQuote = {
      credits: 6,
      items: [
        { quote: turntable, refused: null },
        { quote: { ...turntable, outputs: ["ring-rose_gold-360.mp4"] }, refused: null },
      ],
      refused: null,
      warnings: [],
    };
    const html = renderToStaticMarkup(<RenderJobCost quote={bulk} error={null} pending={false} kind="turntable" />);

    expect(html).toContain("6 credits");
    expect(html).toContain("for 2 videos");
    expect(html).not.toContain("240");
  });

  it("offers an upgrade when the plan has no bulk requests, though its jobs are priced", () => {
    const bulk: RenderJobBulkQuote = {
      credits: 2,
      items: [{ quote: still, refused: null }],
      refused: { status: 402, detail: "Rendering several scenes or variants at once is part of Grow and Studio, not Free." },
      warnings: [],
    };
    const html = renderToStaticMarkup(<RenderJobCost quote={bulk} error={null} pending={false} />);

    expect(html).toContain("part of Grow and Studio, not Free.");
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain("Costs");
  });
});

describe("RenderJobError", () => {
  it("offers an upgrade for a job the credits or plan can't cover, and the reason otherwise", () => {
    const short = new AuthRequestError("Not enough render credits (2 needed). Upgrade your plan or buy a top-up.", 402);

    expect(renderToStaticMarkup(<RenderJobError error={short} />)).toContain('href="/pricing"');
    expect(renderToStaticMarkup(<RenderJobError error={new Error("Render queue full")} />)).toContain("Render queue full");
    expect(renderToStaticMarkup(<RenderJobError error={null} />)).toBe("");
  });
});
