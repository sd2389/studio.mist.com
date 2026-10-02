"use client";

import { AlertTriangle } from "lucide-react";

/** Why an export took a fallback path (e.g. no H.264 encoder at this size) — never silent. */
export function CaptureNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
