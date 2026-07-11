"use client";

import { useViewerToastStore } from "@/stores/viewer-toast-store";

/** Matches StudioTopBar toast chrome — shared viewer status messages. */
export function ViewerToastHost() {
  const message = useViewerToastStore((s) => s.message);
  if (!message) return null;

  return (
    <p
      className="pointer-events-none absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground shadow-md"
      role="status"
    >
      {message}
    </p>
  );
}
