import Link from "next/link";
import { PageIntro } from "@/components/site/PageIntro";
import { SiteShell } from "@/components/site/SiteShell";
import { ctaSecondary, sectionFrame } from "@/components/site/site-styles";
import { StonesGrid } from "@/components/stones/StonesGrid";
import { FeatureDisabledPage } from "@/features/feature-flags";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Diamond cuts · MIST Studio",
};

export default async function StonesPage() {
  const flags = await fetchFeatureFlagsServer();
  if (!isFeatureEnabled(flags, "stones")) {
    return <FeatureDisabledPage title="Stone viewer unavailable" />;
  }

  return (
    <SiteShell>
      <section className={`${sectionFrame} pb-14 pt-20 sm:pt-28`}>
        <PageIntro
          kicker="Stones · Index"
          title="Every cut,"
          titleItalic="true to proportion."
          lead="Study the silhouette, facets and fire of each cut in real time — every one ray-traced. Open any stone to explore fancy colours and studio lighting."
        >
          <Link href="/design" className={ctaSecondary}>
            Set one in a ring
          </Link>
        </PageIntro>
      </section>
      <section className={`${sectionFrame} pb-28`}>
        <StonesGrid />
      </section>
    </SiteShell>
  );
}
