import type { Metadata } from "next";
import Link from "next/link";
import { FEATURE_SECTIONS } from "@/components/features-page/feature-sections";
import { FeatureMedia } from "@/components/features-page/FeatureMedia";
import { SectionIndex } from "@/components/features-page/SectionIndex";
import { PageIntro, Stat } from "@/components/site/PageIntro";
import { Reveal } from "@/components/site/Reveal";
import { SiteShell } from "@/components/site/SiteShell";
import { ctaPrimary, ctaSecondary, headingSection, kicker, sectionFrame, textLink } from "@/components/site/site-styles";

export const metadata: Metadata = {
  title: "Features · MIST Studio",
  description:
    "Everything in MIST Studio: CAD import in ten formats, ray-traced stones in 22 cuts, 21 metals, eight studio sets, stills up to 8K, campaign packs, a shoppable 3D embed and a parametric ring designer.",
};

/** /features: every part of the studio, one chapter each, in the home film's voice. */
export default function FeaturesPage() {
  return (
    <SiteShell>
      <section className={`${sectionFrame} pb-20 pt-20 sm:pt-28`}>
        <PageIntro
          kicker="Features"
          title="Everything the studio"
          titleItalic="can do."
          lead="From your CAD file to a campaign: each tool in MIST, with the numbers read straight from the product."
        >
          <div className="grid max-w-[640px] grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
            <Stat label="Formats">10</Stat>
            <Stat label="Cuts">22</Stat>
            <Stat label="Metals">21</Stat>
            <Stat label="Studio sets">8</Stat>
          </div>
        </PageIntro>
      </section>

      <div className={`${sectionFrame} grid gap-16 pb-10 lg:grid-cols-[180px_1fr]`}>
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <SectionIndex sections={FEATURE_SECTIONS} />
          </div>
        </aside>

        <div className="grid gap-28 sm:gap-36">
          {FEATURE_SECTIONS.map((section, k) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-28">
              <div className={`grid items-center gap-12 xl:grid-cols-2 ${k % 2 ? "xl:[&>*:first-child]:order-2" : ""}`}>
                <Reveal>
                  <p className={kicker}>
                    {String(k + 1).padStart(2, "0")} · {section.label}
                  </p>
                  <h2 id={`${section.id}-title`} className={`${headingSection} mt-6`}>
                    {section.title}
                    <br />
                    <span className="italic">{section.titleItalic}</span>
                  </h2>
                  <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-dim">{section.lead}</p>
                  <div className="mt-9 grid max-w-[520px] grid-cols-2 gap-x-8 gap-y-5">
                    {section.specs.map((spec) => (
                      <Stat key={spec.label} label={spec.label}>
                        {spec.value}
                      </Stat>
                    ))}
                  </div>
                  <ul className="mt-9 grid max-w-[52ch] gap-3 border-t border-hairline pt-7 text-[15px] leading-relaxed text-dim">
                    {section.points.map((point) => (
                      <li key={point} className="flex gap-3">
                        <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-holo" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  {section.cta ? (
                    <Link href={section.cta.href} className={`${textLink} mt-8`}>
                      {section.cta.label} →
                    </Link>
                  ) : null}
                </Reveal>
                <Reveal delay={120}>
                  <FeatureMedia media={section.media} />
                </Reveal>
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className={`${sectionFrame} mt-24 flex flex-col gap-8 border-t border-hairline py-24 sm:flex-row sm:items-end sm:justify-between`}>
        <div>
          <p className={kicker}>Your turn</p>
          <Link
            href="/signup?next=/dashboard"
            className="mt-5 block font-display text-[clamp(3rem,1rem+6vw,7rem)] font-light italic leading-none tracking-[-0.045em] transition-colors duration-500 hover:text-holo"
          >
            Build yours
          </Link>
          <p className="mt-4 text-[16px] text-dim">Three pieces free. No card needed.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup?next=/dashboard" className={ctaPrimary}>
            Start free
          </Link>
          <Link href="/pricing" className={ctaSecondary}>
            See pricing
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
