"use client";

import { useEffect } from "react";
import type { HarnessResult } from "./job-payload";
import { probeRenderer } from "./renderer-info";

/**
 * The render harness's probe mode (ADR 0005): what would draw a job in this browser. The worker
 * opens it at start and, where it must have a GPU, refuses to claim on SwiftShader or WebGL 2.
 */
export function HarnessProbe() {
  useEffect(() => {
    window.__HARNESS_STATE__ = "loading";
    probeRenderer().then(
      (renderer) => {
        const result: HarnessResult = { renderer, outputs: [] };
        window.__RENDER_RESULT__ = result;
        window.__HARNESS_STATE__ = "ready";
      },
      (error: unknown) => {
        window.__HARNESS_STATE__ = `error:${error instanceof Error ? error.message : String(error)}`;
      },
    );
  }, []);
  return null;
}
