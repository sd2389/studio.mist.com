declare module "n8ao" {
  import type { Pass } from "postprocessing";
  import type { Camera, Color, Scene } from "three";

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      denoiseRadius: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      aoSamples?: number;
      denoiseSamples?: number;
      color?: Color;
      screenSpaceRadius?: boolean;
      renderMode?: 0 | 1 | 2 | 3 | 4;
    };
    enabled: boolean;
    setQualityMode(mode: string): void;
  }
}
