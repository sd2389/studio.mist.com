"use client";

import { useEffect, useState } from "react";
import { knownServerExports, loadServerExports } from "../lib/server-exports";

/**
 * Whether exports render on the server (`server_exports`); null until the flags are read, which
 * the studio does as it opens. Export buttons wait for the answer, so no export starts the old
 * way while the flag is on, or the new way while it is off.
 */
export function useServerExports(): boolean | null {
  const [enabled, setEnabled] = useState(knownServerExports);

  useEffect(() => {
    if (enabled !== null) return;
    let active = true;
    void loadServerExports().then((next) => {
      if (active) setEnabled(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return enabled;
}
