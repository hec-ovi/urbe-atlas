# Box map

- atlas (root): deterministic city blueprint with full-width street ground, shared pedestrian seams and forward-only transit routes. CONTRACT.md, schemas in schema/, generator in src/, reusable CLI at dist/cli.mjs. Mirrors the Interior core-feasibility and Exterior floor-constant contracts; imports no sibling runtime data.
- src/hydro: deterministic lagoon, river and sea-coast surfaces, shoreline construction bands, land exclusions and typed bridge/tunnel contacts. src/hydro/CONTRACT.md. Depends on the root blueprint, geometry and error contracts.
- src/ui: preview box (canvas map view with parcel picking, nondegenerate highway deck faces, depth-visible diagnostic paths, params panel with parameter import/export, progress cover, notifications, parcel link template, legend, layer toggles). src/ui/CONTRACT.md. Depends on the root contract and the optional Engine assembly manifest contract.
- src/zoning: district population forecasts, use eligibility and complete rectangular or lot-following footprints on the published building grid. src/zoning/CONTRACT.md. Depends on Atlas geometry and mirrored Interior core feasibility; Buildability consumes its hosting policy.
