"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { asViewerRenderer } from "@/lib/gpu/viewer-renderer";
import type { SceneAdvancedSettings } from "@/lib/slot-materials/model-config";
import { resolvePostFXConfig } from "@/lib/viewer-postfx-config";
import {
  createViewerPostFXComposer,
  type ViewerPostFXComposer,
} from "@/lib/viewer-postfx-pipeline";
import { applyQualityToPostFX } from "@/lib/viewer-quality";
import { usePostFXComposerStore } from "@/stores/postfx-composer-store";
import { useViewerQualityStore } from "@/stores/viewer-quality-store";

type ViewerPostFXProps = {
  advanced?: SceneAdvancedSettings;
};

/**
 * TSL RenderPipeline (bloom + GTAO + ACES + SMAA).
 * Takes over the frame so R3F does not also blit an unprocessed beauty pass.
 */
export function ViewerPostFX({ advanced }: ViewerPostFXProps) {
  const gl = asViewerRenderer(useThree((state) => state.gl));
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const composerRef = useRef<ViewerPostFXComposer | null>(null);
  const setComposerRefs = usePostFXComposerStore((state) => state.setRefs);
  const effective = useViewerQualityStore(useShallow((s) => s.effective));
  const config = useMemo(
    () => applyQualityToPostFX(resolvePostFXConfig(advanced), effective),
    [advanced, effective],
  );

  useLayoutEffect(() => {
    const { composer, dispose } = createViewerPostFXComposer(
      gl,
      scene,
      camera,
      size.width,
      size.height,
      config,
      gl.toneMappingExposure,
    );
    composerRef.current = composer;
    setComposerRefs({ composer, gl });
    return () => {
      dispose();
      composerRef.current = null;
      setComposerRefs(null);
    };
  }, [gl, scene, camera, config, size.width, size.height, setComposerRefs]);

  useFrame(() => {
    composerRef.current?.render();
  }, 1);

  return null;
}
