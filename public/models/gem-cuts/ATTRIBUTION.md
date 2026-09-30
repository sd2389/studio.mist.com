# Gemstone cut geometry — attribution

The solids in `gemstone-cuts.obj` are derived from **"3D models of various gemstone cuts"**
by [CraftsmanSpace](https://www.craftsmanspace.com/free-3d-models/3d-models-of-various-gemstone-cuts.html),
released under the **Creative Commons Attribution-ShareAlike** licence.

## What was changed

The original download is a single merged mesh with no object grouping. It was split into
its 20 connected solids, each recentred and uniformly scaled so the girdle half-width is
1.0 (the scene convention used across the stone pages), and re-exported with `o` group
markers. No facet geometry was altered.

Every solid was verified closed (no open edges) with outward-facing winding — both are
required for refraction, since a ray entering a leaky mesh never finds a surface to exit.

## Licence obligations

CC-BY-SA is share-alike: this derived file and any further adaptation of it must stay under
the same licence and keep this attribution. That covers **these model files only** — it does
not extend to MIST's application code, which merely loads them at runtime.

If the gem library ever needs to be proprietary, replace these with commercially licensed
geometry (or generated cuts) and delete this directory.
