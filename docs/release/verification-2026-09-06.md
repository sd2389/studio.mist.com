# MIST Studio release verification

Status: implementation in progress; browser release checks and main delivery are not complete.

## Verified

- Production build passes with the CAD, authenticated-asset, save/restore, export-isolation and performance-mode changes. Backend-dependent gallery, stone library and upload pages render dynamically.
- Frontend: 87 tests pass. Backend: 74 tests pass. TypeScript passes. Lint has no errors (existing complexity/unused-import warnings remain).
- Real Rhino imports: DB-131 bracelet (51 MB) and DN-064 necklace (137 MB) converted and rendered in the development harness.
- Necklace placement layers match the CAD: Gem 1 = 135, Gem 2 = 8, Gem 3 = 2, Gem 4 = 6. Other block placements are metal or construction geometry, not additional gemstones.
- Isolated API workflow: upload bracelet GLB, list scene, update name/exposure, reopen saved scene.
- App login API sets a session cookie. The authenticated private-asset route streams the 23,413,216-byte bracelet GLB; anonymous requests receive 401. Response is private and no-store.
- The procedural homepage ring rendered on desktop and a 390×844 viewport before the latest toolbar/export changes.

## Fixes covered by regression tests

- Material assignment and cloning preserve custom gemstone shader nodes and independent uniforms.
- Diamond/gem IOR is not overwritten by Three.js reflectivity's setter.
- Catalog gemstone choices survive asynchronous catalog hydration.
- Scene settings preserve advanced exposure, backgrounds and poses.
- Thumbnail/export cleanup does not dispose the editable model's geometry/materials.
- Rhino block placements retain their original layer attributes.
- Specific gem-layer aliases win over generic `Gem` tokens.
- Legacy filename viewer links resolve an unambiguous customer storage key.
- Private asset URLs use the authenticated app proxy instead of an unauthenticated browser request.

## Remaining release checks

- Browser sign-in, dashboard → saved studio, slot switching, save/restore look, PNG/JPEG export and published embed.
- Desktop and mobile visual review of the final homepage and studio controls.
- WebGPU and WebGL2 fallback rendering of the final changes, including performance mode.
- Verify separate metal/gem environments: the existing renderer currently chooses one scene environment using the active preset.
- Validate PostgreSQL migrations / documented clean-checkout startup. Local smoke testing used an isolated SQLite database, not production data.
- Review final diff, commit, and deliver verified changes to GitHub main.

Browser checks were interrupted by a usage-limit rejection (subsequently reset) and then an unavailable browser security policy check. Neither is a successful browser test.

Private CAD files are local test inputs and are excluded from Git. Do not publish them as bundled demo assets.
