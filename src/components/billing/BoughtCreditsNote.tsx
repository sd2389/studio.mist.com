import { boughtCreditsLabel } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

/** One line under a credit balance on how many of it were bought, which renewals keep; nothing when none were. */
export function BoughtCreditsNote({ bought, className }: { bought: number; className?: string }) {
  const label = boughtCreditsLabel(bought);
  if (!label) return null;
  return <p className={cn("text-xs text-muted-foreground", className)}>{label}.</p>;
}
