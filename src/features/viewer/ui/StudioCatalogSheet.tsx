"use client";

import { cn } from "@/lib/utils";

type StudioCatalogSheetProps = {
  open: boolean;
  children: React.ReactNode;
  className?: string;
};

/** Phone catalog drawer — paper panel, hairline, ≤ 50vh above the tab bar. */
export function StudioCatalogSheet({
  open,
  children,
  className,
}: StudioCatalogSheetProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "relative z-30 flex max-h-[50vh] flex-col border-t border-black/10 bg-[#F4F2EE] md:hidden",
        className,
      )}
    >
      <div className="flex shrink-0 justify-center pb-1 pt-2">
        <div className="h-1 w-10 rounded-full bg-black/15" aria-hidden />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
