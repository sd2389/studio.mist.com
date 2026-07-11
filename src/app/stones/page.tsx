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
      <div
        aria-hidden
        className="absolute -right-32 -top-32 size-[520px] rounded-full bg-[#b89960]/10 blur-[110px]"
      />
      <div className="relative z-10 mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <header className="mb-14 flex flex-col gap-8 border-b border-foreground/10 pb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-2 text-kicker text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> DevJewels Studio
            </Link>
            <h1 className="font-display text-5xl font-normal italic tracking-[-0.04em] text-foreground sm:text-7xl">
              Diamond <span className="text-[#9a7d4d]">cuts.</span>
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
              "border-foreground/15 bg-card/70",
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
