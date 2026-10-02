"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRICING_PATH = "/pricing";

/** One line on what a paid plan unlocks, ending in an "Upgrade" link. */
export function UpgradePrompt({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {children}{" "}
      <Link href={PRICING_PATH} className="text-primary hover:underline">
        Upgrade
      </Link>
    </p>
  );
}

/** The upgrade call to action as a button, in place of a locked feature's own action. */
export function UpgradeButton({
  children = "Upgrade",
  size = "default",
  className,
}: {
  children?: ReactNode;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <Link href={PRICING_PATH} className={cn(buttonVariants({ size }), className)}>
      {children}
    </Link>
  );
}
