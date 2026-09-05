# Box map

- test/runtime: native event-loop turns between completed tests. test/runtime/CONTRACT.md. Depends on Vitest's public runner and Node timers; selected by vite.config.ts.

- src/streets/construction/paving: fitted paving data, canonical whole-cell spans and functional ground ownership. src/streets/construction/paving/CONTRACT.md. Depends on street construction and the Atlas ground schema; finish settings come from the caller.

- src/geom: fixed-point polygon operations, shared crossing normalization and non-publishing precision checks. src/geom/CONTRACT.md. Depends on root Atlas coordinates and the existing integer clipping library.
- atlas (root): deterministic city blueprint with full-width street ground, shared pedestrian seams and forward-only transit routes. CONTRACT.md, schemas in schema/, generator in src/, reusable CLI at dist/cli.mjs. Mirrors the Interior core-feasibility and Exterior floor-constant contracts; imports no sibling runtime data.
- src/hydro: deterministic water, shoreline bands, land exclusions and exact bridge/tunnel contact reservations. src/hydro/CONTRACT.md. Depends on the root blueprint, geometry, errors and street construction corridors.
- src/ui: preview box (canvas map view with parcel picking, nondegenerate highway deck faces, depth-visible diagnostic paths, footprint shape and city controls with parameter import/export, progress cover, notifications, parcel link template, legend, layer toggles). src/ui/CONTRACT.md. Depends on the root contract and the optional Engine assembly manifest contract.
- src/zoning: district population forecasts, use eligibility and complete rectangular or lot-following footprints on the published building grid. src/zoning/CONTRACT.md. Depends on Atlas geometry and mirrored Interior core feasibility; Buildability consumes its hosting policy.
- src/transit: bus service and early rail plans with full sidewalk-connected subway bays. src/transit/CONTRACT.md. Depends on street construction and zoning capacity; reservations/ owns entrance land geometry.
