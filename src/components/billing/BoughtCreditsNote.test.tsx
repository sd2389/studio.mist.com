import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoughtCreditsNote } from "@/components/billing/BoughtCreditsNote";
import { boughtCreditsLabel, boughtCreditsLeft } from "@/lib/billing/format";

describe("BoughtCreditsNote", () => {
  it("says how many of the balance were bought and that renewals keep them", () => {
    expect(renderToStaticMarkup(<BoughtCreditsNote bought={5} />)).toBe(
      '<p class="text-xs text-muted-foreground">Includes 5 bought credits, kept at renewal.</p>',
    );
    expect(boughtCreditsLabel(1)).toBe("Includes 1 bought credit, kept at renewal");
  });

  it("draws nothing when none of the balance was bought", () => {
    expect(renderToStaticMarkup(<BoughtCreditsNote bought={0} />)).toBe("");
    expect(boughtCreditsLabel(-3)).toBeNull();
  });

  it("counts bought credits down only once the plan's are spent", () => {
    // 50 bought of 75: the next 25 spent are the plan's.
    expect(boughtCreditsLeft(50, 60)).toBe(50);
    expect(boughtCreditsLeft(50, 40)).toBe(40);
    expect(boughtCreditsLeft(50, 0)).toBe(0);
  });
});
