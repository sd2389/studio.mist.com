"use client";

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { useThree } from "@react-three/fiber";
import { BlendFunction, KernelSize, ToneMappingMode, type EffectComposer as EffectComposerImpl } from "postprocessing";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { SceneAdvancedSettings } from "@/lib/slot-materials/model-config";
import { resolvePostFXConfig } from "@/lib/viewer-postfx-config";
import { usePostFXComposerStore } from "@/stores/postfx-composer-store";

type ViewerPostFXProps = {
  advanced?: SceneAdvancedSettings;
};

/**
 * Composer pipeline. MSAA is disabled here because the composer's resolve blit
 * conflicts with N8AO's depth-aware downsample on some GPU/driver combos
 * (GL_INVALID_OPERATION: glBlitFramebuffer depth/stencil format mismatch).
 * SMAA below handles edge antialiasing instead. enableNormalPass gives N8AO
 * a dedicated normal target so it stops sampling the multisampled depth.
 */
export function ViewerPostFX({ advanced }: ViewerPostFXProps) {
  const gl = useThree((state) => state.gl);
  const composerRef = useRef<EffectComposerImpl>(null);
  const setComposerRefs = usePostFXComposerStore((state) => state.setRefs);
  const config = useMemo(() => resolvePostFXConfig(advanced), [advanced]);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    setComposerRefs({ composer, gl });
    return () => setComposerRefs(null);
  }, [gl, config, setComposerRefs]);

  return (
    <EffectComposer ref={composerRef} multisampling={0} enableNormalPass>
      <N8AO
        halfRes={config.ao.halfRes}
        quality={config.ao.quality}
        aoRadius={config.ao.aoRadius}
        intensity={config.aoEnabled ? config.ao.intensity : 0}
        distanceFalloff={config.ao.distanceFalloff}
        denoiseRadius={config.ao.denoiseRadius}
        depthAwareUpsampling={config.ao.depthAwareUpsampling}
      />
      <Bloom
        intensity={config.bloom.intensity}
        luminanceThreshold={config.bloom.luminanceThreshold}
        luminanceSmoothing={config.bloom.luminanceSmoothing}
        mipmapBlur={config.bloom.mipmapBlur}
        radius={config.bloom.radius}
        kernelSize={KernelSize.LARGE}
        blendFunction={BlendFunction.ADD}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
