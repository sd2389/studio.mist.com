# ADR 0002: WebGPURenderer as the studio GPU path

## Status

Accepted

## Context

The jewelry viewer, gallery/stone canvases, exports, and gem sparkle/fire shader all ran on `THREE.WebGLRenderer` plus GLSL `onBeforeCompile` and the WebGL-only pmndrs/postprocessing + N8AO stack. Three.js r184’s `WebGPURenderer` is the supported renderer going forward (WebGPU first, WebGL 2 only as that renderer’s fallback). GLSL injection and EffectComposer do not run on it.

## Decision

- Create every R3F canvas and offscreen export renderer with `WebGPURenderer` (`src/lib/gpu/`).
- Express jewelry gem sparkle/fire in TSL node slots on `MeshPhysicalMaterial`.
- Replace bloom / AO / ACES / SMAA with the TSL `RenderPipeline` (GTAO + BloomNode + `renderOutput` + SMAANode).
- Replace drei `ContactShadows` (GLSL blur) with a `ShadowMaterial` ground plane.

## Consequences

- Custom GLSL and `@react-three/postprocessing` / `postprocessing` / N8AO are no longer on the live path.
- Browsers without WebGPU still run via `WebGPURenderer`’s WebGL 2 backend; TSL compiles to WGSL or GLSL.
- Ground contact shadows are light-map shadows, not drei’s separate blurred depth pass — softer contact look may differ.
- Screenshot/export readback uses the canvas blit WebGPURenderer already performs (no `preserveDrawingBuffer`).

## Rollback

Revert this change set. The previous stack was `THREE.WebGLRenderer` + GLSL jewelry shader + pmndrs EffectComposer.
