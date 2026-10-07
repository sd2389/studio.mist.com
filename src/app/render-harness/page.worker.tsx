import { Suspense } from "react";
import { HarnessConvert, HarnessExport, HarnessProbe } from "@/features/render/harness";
import { RenderHarness } from "@/features/viewer/ui/RenderHarness";

type RenderHarnessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The render harness. Only the render worker's build has this route (`BUILD_TARGET=worker` in
 * next.config.ts adds `*.worker.tsx` pages); the public build has none. Not linked from any UI.
 * `?mode=probe` reports what would draw here, `?mode=export` renders the job the worker hands
 * over in `window.__RENDER_JOB__` (ADR 0005), `?mode=convert` converts a design's CAD file the
 * way the upload page saves one (ADR 0006), and no mode is the golden capture.
 */
export default async function RenderHarnessPage({ searchParams }: RenderHarnessPageProps) {
  const { mode } = await searchParams;
  if (mode === "export") return <HarnessExport />;
  if (mode === "convert") return <HarnessConvert />;
  if (mode === "probe") return <HarnessProbe />;
  return (
    <Suspense fallback={null}>
      <RenderHarness />
    </Suspense>
  );
}
