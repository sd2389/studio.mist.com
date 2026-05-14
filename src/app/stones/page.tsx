import Link from "next/link";
import { Gem } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StonesGrid } from "@/components/stones/StonesGrid";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Diamond cuts · DevJewels Studio",
};

export default function StonesPage() {
  return (
    <div className="relative min-h-[100dvh] bg-app-canvas">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/"
              className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground"
            >
              DevJewels Studio
            </Link>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold text-foreground sm:text-4xl">
              <Gem className="size-7 text-primary" aria-hidden />
              Diamond cuts
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Browse standard cuts in 3D. Each tile renders the same diamond material from the studio.
              Tap a tile to open the cut in full studio — try a Pink, Canary, or Black diamond.
            </p>
          </div>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline" }), "border-border")}
          >
            Dashboard
          </Link>
        </header>

        <StonesGrid />
      </div>
    </div>
  );
}
