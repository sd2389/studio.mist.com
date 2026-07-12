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
      <div className="relative z-10 mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:py-12">
        <header className="mb-10 flex flex-col gap-8 border-b border-black pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#ef5b2a]"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> DevJewels Studio
            </Link>
            <h1 className="text-[clamp(4rem,9vw,9rem)] font-black uppercase leading-[0.76] tracking-[-0.085em] text-black">
              Stone / Index
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
              "rounded-none border-black bg-transparent text-[9px] font-black uppercase tracking-[0.14em]",
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
