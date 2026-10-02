# ADR 0003: Ray-traced gems through facet planes

## Status

Accepted

## Context

Gems rendered as `MeshPhysicalMaterial` transmission glass with TSL specular tweaks (sparkle taps, a fire tint). Raster transmission refracts the backdrop once and never sees the stone's own back facets, so there is no total internal reflection — the effect that makes a diamond's black-and-white facet pattern, its brilliance and its fire. Stones read as grey glass at best and as plastic at worst, whatever the lighting. A spectral path tracer (`three-gpu-pathtracer`, WebGL-only) was prototyped on the loose-stone pages; it converged in seconds, stayed noisy, and could not drive the live viewer, embeds or exports.

## Decision

- Cut stones are convex polyhedra, so a ray inside one exits through the nearest facet plane ahead. Each stone's planes are extracted once on the CPU (`gem-trace-geometry.ts`: islands → area-weighted normal clusters → planes pushed out to the farthest vertex) and stored, one row per stone, in a shared float texture (`gem-trace-atlas.ts`). Geometry carries a `gemStoneRow` vertex attribute, so materials stay independent of the mesh they draw.
- The TSL shader (`gem-trace-shader.ts`) traces per fragment: dielectric Fresnel at the entry facet, refraction inside, a fixed number of internal bounces, per-wavelength refraction at every exit (fire), Beer–Lambert absorption over real path length (body colour), and a viewer-obstruction cone (the lens blocks light from behind the camera, which draws the "arrows").
- Lighting comes from procedural jewelry tents (`gem-studio-environment.ts`) — white catalogue, grey studio, dark contrast, sparkle — sampled unfiltered so facet flashes stay pinpoint-sharp, plus a few analytic pinpoint glints.
- `createGemMaterial` keeps returning a `MeshPhysicalMaterial`; tracing attaches through `outputNode`, transmission is switched off, and each traced material gets its own `customProgramCacheKey` (the WebGPU renderer otherwise hashes every non-node material's node slots alike and shares the first compile's uniforms). Translucent and opaque stones (pearl, opal, onyx, cabochons) keep the surface-shaded path.
- Tone mapping moves from ACES to Khronos PBR Neutral, which keeps metal and gem colours true to their presets.

## Consequences

- Live gems show true brilliance, total internal reflection, fire and Hearts & Arrows, at interactive frame rates, in the viewer, embeds, exports and every gallery/stone canvas.
- The facet planes are the stone's convex hull: exact for faceted cuts, an approximation for concave CAD stones. Stones with more than 127 distinct facets are merged at a looser normal tolerance.
- The atlas never frees rows during a session; a page that loads thousands of distinct stones keeps them all resident.
- Gem appearance no longer depends on the scene's ambient/spot lights; gems are lit only by their tent or chosen HDR.

## Rollback

Delete the `gem-trace-*` modules and the `isGemTraceCandidate` branch in `createGemMaterial` / `createGemMaterialFromParams`; every call site falls back to the TSL surface shader in `jewelry-gem-shader.ts`. Restore `THREE.ACESFilmicToneMapping` in `viewer-postfx-pipeline.ts` to get the previous colour response.
