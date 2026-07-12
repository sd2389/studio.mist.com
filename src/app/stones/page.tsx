import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StonesGrid } from "@/components/stones/StonesGrid";
import { FeatureDisabledPage } from "@/features/feature-flags";
import {
  fetchFeatureFlagsServer,
  isFeatureEnabled,
} from "@/lib/feature-flags/server-fetch";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Diamond cuts · DevJewels Studio",
};

export default async function StonesPage() {
  const flags = await fetchFeatureFlagsServer();
  if (!isFeatureEnabled(flags, "stones")) {
    return <FeatureDisabledPage title="Stone viewer unavailable" />;
  }
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-app-canvas">
      <div className="relative z-10 mx-auto max-w-[1500px] px-3 py-3 sm:px-4">
        <header className="ice-panel mb-3 flex flex-col gap-8 p-7 sm:flex-row sm:items-end sm:justify-between lg:p-12">
          <div>
            <Link
              href="/"
              className="mb-10 inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-black/45"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> DevJewels Studio
            </Link>
            <h1 className="text-[clamp(4rem,9vw,9rem)] font-light leading-[0.76] tracking-[-0.085em] text-black">
              Stone <span className="text-black/20">/ Index</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Study the silhouette, facets, and fire of standard cuts in real
              time. Open any stone to explore fancy colors and studio lighting.
            </p>
          </div>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "rounded-full border-black/10 bg-white/45 text-[9px] uppercase tracking-[0.1em] shadow-none",
            )}
          >
            Dashboard
          </Link>
        </header>

        <StonesGrid />
      </div>
    </div>
  );
}
