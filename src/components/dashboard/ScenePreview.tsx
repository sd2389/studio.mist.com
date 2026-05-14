"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Gem } from "lucide-react";
import { Component, type ReactNode } from "react";
import { resolveModelUrl } from "@/lib/model-url";
import { viewerIdFromModelKey } from "@/lib/model-key";

const ScenePreviewCanvas = dynamic(
  () => import("@/components/dashboard/ScenePreviewCanvas").then((m) => m.ScenePreviewCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="grid size-full place-items-center text-muted-foreground/40">
        <Gem className="size-12 animate-pulse" aria-hidden />
      </div>
    ),
  },
);

class PreviewErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Swallow — the fallback already communicates the failure.
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function MissingFile() {
  return (
    <div className="grid size-full place-items-center bg-gradient-to-br from-stone-100 via-neutral-50 to-stone-200">
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <AlertTriangle className="size-7 text-muted-foreground/60" aria-hidden />
        <p className="text-xs font-medium text-foreground/70">Model file unavailable</p>
        <p className="text-[10px] leading-tight text-muted-foreground">
          Re-upload to restore preview
        </p>
      </div>
    </div>
  );
}

type ScenePreviewProps = {
  modelKey: string;
};

export function ScenePreview({ modelKey }: ScenePreviewProps) {
  const viewerId = viewerIdFromModelKey(modelKey);
  const url = resolveModelUrl(viewerId);
  return (
    <PreviewErrorBoundary fallback={<MissingFile />}>
      <ScenePreviewCanvas modelUrl={url} />
    </PreviewErrorBoundary>
  );
}
