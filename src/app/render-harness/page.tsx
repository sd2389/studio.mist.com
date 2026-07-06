import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RenderHarness } from "@/features/viewer/ui/RenderHarness";

export const dynamic = "force-dynamic";

export default function RenderHarnessPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_RENDER_HARNESS !== "1") {
    notFound();
  }
  return (
    <Suspense fallback={null}>
      <RenderHarness />
    </Suspense>
  );
}
