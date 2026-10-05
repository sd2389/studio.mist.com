import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import type { RenderJobQuote } from "../lib/render-jobs-api";
import { RenderJobCost } from "./RenderJobCost";

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
