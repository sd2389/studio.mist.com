"use client";

import { UploadCloud } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingUploadIsland() {
  return (
    <div className="relative rounded-3xl border border-dashed border-border/80 bg-card/80 p-8 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:ring-white/[0.05] sm:p-10">
      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20"
          aria-hidden
        >
          <UploadCloud className="size-7" strokeWidth={1.25} />
        </div>
        <div className="max-w-sm space-y-2">
          <p className="text-lg font-semibold text-foreground">Upload a model</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Drop GLB, STL, or Rhino 3DM — parsed in your browser, then saved as GLB with layer
            controls.
          </p>
        </div>
        <Link
          href="/upload-model"
          className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-xl px-6 shadow-md")}
        >
          <UploadCloud className="size-4 shrink-0" aria-hidden />
          Upload New Model
        </Link>
        <p className="text-xs text-muted-foreground">
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </Link>{" "}
          or{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            sign in
          </Link>{" "}
          to save models to your library.
        </p>
      </div>
    </div>
  );
}
