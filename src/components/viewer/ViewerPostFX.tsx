"use client";

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, KernelSize, ToneMappingMode } from "postprocessing";

/**
 * Composer pipeline. MSAA is disabled here because the composer's resolve blit
 * conflicts with N8AO's depth-aware downsample on some GPU/driver combos
 * (GL_INVALID_OPERATION: glBlitFramebuffer depth/stencil format mismatch).
 * SMAA below handles edge antialiasing instead. enableNormalPass gives N8AO
 * a dedicated normal target so it stops sampling the multisampled depth.
 */
export function ViewerPostFX() {
  return (
    <EffectComposer multisampling={0} enableNormalPass>
      <N8AO
        halfRes
        quality="medium"
        aoRadius={2.2}
        intensity={0.42}
        distanceFalloff={0.55}
        denoiseRadius={6}
        depthAwareUpsampling
      />
      <Bloom
        intensity={0.42}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.16}
        mipmapBlur
        radius={0.85}
        kernelSize={KernelSize.LARGE}
        blendFunction={BlendFunction.ADD}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
