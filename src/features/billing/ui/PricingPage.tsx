"use client";

import { Box, Diamond, Film, Gem, Ruler, ScanEye } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/site/PageIntro";
import { ctaPrimary, ctaSecondary, headingSection, kicker, sectionFrame, textLink } from "@/components/site/site-styles";
import type { PricingCatalog } from "@/lib/billing/types";
import { PricingComparison } from "./PricingComparison";
import { PricingPlanCards } from "./PricingPlanCards";
import { PricingTopUps } from "./PricingTopUps";
import { usePricingCheckout } from "./use-pricing-checkout";

type PricingPageProps = {
  catalog: PricingCatalog;
  isAuthenticated: boolean;
};

/** What every plan gets — the studio itself is never gated, only how much of it you use. */
const INCLUDED = [
  {
    icon: Diamond,
    title: "Ray-traced stones",
    body: "Real refraction, fire and Hearts & Arrows, with an ASET scope to prove the cut.",
  },
  { icon: Gem, title: "22 cuts, every fancy colour", body: "Cuts built facet by facet, and fancy-colour diamonds graded from Light to Deep." },
  { icon: Box, title: "Your own CAD", body: "GLB, STL, 3DM, OBJ, FBX, PLY, 3MF, STEP and IGES, split into metals and stones." },
  { icon: Ruler, title: "Ring designer", body: "Parametric rings, studs and pendants with STL, OBJ and GLB downloads." },
  { icon: Film, title: "Campaign packs", body: "Stills, cutouts, turntables and 360° spins for every metal, in one ZIP." },
  { icon: ScanEye, title: "Studio scenes", body: "Mirror, water, marble and silk sets with catalogue light boxes." },
] as const;

const FAQ = [
  {
    q: "What counts as a model upload?",
    a: "Each model you upload and save to your workspace uses one model credit. Re-opening and editing it never does.",
  },
  {
    q: "Do unused credits roll over?",
    a: "Paid plans refill every billing period. The free allowance is one-time, so you can try the whole studio before choosing a plan.",
  },
  {
    q: "Can I cancel or change plans?",
    a: "Yes, any time, from your profile.",
  },
  {
    q: "Can shoppers view pieces on my website?",
    a: "Yes, on every plan: paste one snippet and shoppers turn the piece and switch metals and stones.",
  },
] as const;

/** The pricing page's content; the server page wraps it in the site shell. */
export function PricingPageClient({ catalog, isAuthenticated }: PricingPageProps) {
  const { busy, error, subscribe, buyTopUp } = usePricingCheckout(isAuthenticated);

  return (
    <>
      <section className={`${sectionFrame} pb-16 pt-20 sm:pt-28`}>
        <PageIntro
          kicker="Pricing"
          title="Priced per piece"
          titleItalic="you shoot."
          lead="Try three pieces free on your own CAD. Need more? Buy a credit pack or pick a plan — every plan gets the full studio."
        >
          {catalog.top_ups.length > 0 ? (
            <a href="#credits" className={textLink}>
              Buy credit packs
            </a>
          ) : null}
        </PageIntro>
      </section>

      {error ? (
        <p role="alert" className={`${sectionFrame} mb-6`}>
          <span className="block rounded-[16px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-[15px] text-destructive">
            {error}
          </span>
        </p>
      ) : null}

      <section aria-label="Plans" className={sectionFrame}>
        {catalog.plans.length > 0 ? (
          <PricingPlanCards plans={catalog.plans} busy={busy} onChoose={subscribe} />
        ) : (
          <p className="rounded-[24px] border border-hairline bg-surface p-10 text-center text-dim">
            Plans are loading. Refresh in a moment, or{" "}
            <Link href="/contact" className="underline underline-offset-4">
              talk to us
            </Link>
            .
          </p>
        )}
      </section>

      <section aria-labelledby="included" className={`${sectionFrame} py-24`}>
        <p className={kicker}>Every plan</p>
        <h2 id="included" className={`${headingSection} mt-5`}>
          The whole studio, <span className="italic">always.</span>
        </h2>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-background p-7">
              <Icon aria-hidden strokeWidth={1.4} className="size-6 text-holo" />
              <h3 className="mt-5 text-[17px] font-medium tracking-[-0.01em]">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-dim">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {catalog.plans.length > 0 ? (
        <div className={`${sectionFrame} pb-24`}>
          <PricingComparison plans={catalog.plans} />
        </div>
      ) : null}

      {catalog.top_ups.length > 0 ? (
        <div id="credits" className={`${sectionFrame} scroll-mt-24 pb-24`}>
          <PricingTopUps topUps={catalog.top_ups} busy={busy} onBuy={buyTopUp} />
        </div>
      ) : null}

      <section aria-labelledby="faq" className={`${sectionFrame} grid gap-10 pb-24 lg:grid-cols-[1fr_1.4fr]`}>
        <div>
          <p className={kicker}>FAQ</p>
          <h2 id="faq" className={`${headingSection} mt-5`}>
            Questions
          </h2>
        </div>
        <div className="divide-y divide-hairline border-y border-hairline">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium tracking-[-0.01em]">
                {q}
                <span aria-hidden className="text-[22px] font-light text-dim transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-dim">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* The film's closing beat: a big italic call to action, not a boxed banner. */}
      <section className={`${sectionFrame} flex flex-col gap-8 border-t border-hairline py-24 sm:flex-row sm:items-end sm:justify-between`}>
        <div>
          <p className={kicker}>Your turn</p>
          <Link
            href={isAuthenticated ? "/dashboard" : "/signup?next=/dashboard"}
            className="mt-5 block font-display text-[clamp(3rem,1rem+6vw,7rem)] font-light italic leading-none tracking-[-0.045em] transition-colors duration-500 hover:text-holo"
          >
            Shoot your first piece
          </Link>
          <p className="mt-4 text-[16px] text-dim">No card needed for the free plan.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={isAuthenticated ? "/dashboard" : "/signup?next=/dashboard"} className={ctaPrimary}>
            Start free
          </Link>
          <Link href="/contact" className={ctaSecondary}>
            Talk to us
          </Link>
        </div>
      </section>
    </>
  );
}
