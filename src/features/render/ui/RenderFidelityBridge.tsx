"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { asViewerRenderer } from "@/lib/gpu/viewer-renderer";
import type { SceneAdvancedSettings } from "@/lib/slot-materials/model-config";
import { applyViewerColorManagement } from "@/lib/render-color-management";
import { resolvePostFXConfig } from "@/lib/viewer-postfx-config";
import { useRenderFidelityStore } from "@/stores/render-fidelity-store";

type RenderFidelityBridgeProps = {
  exposure: number;
  advanced?: SceneAdvancedSettings;
};

/** Syncs viewport exposure + PostFX settings for offscreen export and video capture. */
export function RenderFidelityBridge({ exposure, advanced }: RenderFidelityBridgeProps) {
  const gl = asViewerRenderer(useThree((state) => state.gl));
  const setRenderFidelity = useRenderFidelityStore((state) => state.setRenderFidelity);
  const postfxConfig = useMemo(() => resolvePostFXConfig(advanced), [advanced]);

  useEffect(() => {
    applyViewerColorManagement(gl, exposure);
    setRenderFidelity({ exposure, postfxConfig });
  }, [gl, exposure, postfxConfig, setRenderFidelity]);

  return null;
}
