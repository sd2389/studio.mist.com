"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { PlanFeatures } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

type PlanGateProps = {
  features: PlanFeatures | null;
  require: "8k" | "batch" | "variants";
  currentValue?: number;
  children: ReactNode;
  fallback?: ReactNode;
};

export function PlanGate({ features, require: gate, currentValue, children, fallback }: PlanGateProps) {
  if (!features) return <>{children}</>;

  let locked = false;
  if (gate === "8k" && features.max_image_resolution < 8192) locked = true;
  if (gate === "batch" && !features.batch_export_enabled) locked = true;
  if (gate === "variants" && currentValue !== undefined && currentValue >= features.max_variants_per_model) {
    locked = true;
  }

  if (!locked) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground">
        This feature requires a paid plan.
      </p>
      <Link href="/pricing" className={cn(buttonVariants({ size: "sm" }), "mt-3 inline-flex")}>
        Upgrade
      </Link>
    </div>
  );
}
