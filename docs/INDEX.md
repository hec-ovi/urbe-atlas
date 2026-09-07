# Box map

- src/streets/construction/modules/diagonal: local 30/45 degree block-cut templates with complete panels and rounded junction returns. Input/output: `src/streets/construction/modules/diagonal/schema.ts`. src/streets/construction/modules/diagonal/CONTRACT.md. Depends on street modules and geometry.

- src/streets/layout: rectangular street grid sized in complete panel groups, with direct graph connections, outer sidewalks, rare 30/45 degree block cuts, sparse parking and short guardrail groups. Input/output: `src/streets/layout/schema.ts`. src/streets/layout/CONTRACT.md. Depends on street construction dimensions, street modules and Atlas seed streams.

- src/streets/construction/modules: dimensioned panels, curbs, gutters, corners, parking cuts, guardrails and compact planning covers. Input/output: `src/streets/construction/modules/schema.ts`. src/streets/construction/modules/CONTRACT.md. Depends on Atlas coordinates, errors and geometry; construction and renderers consume its repeated placements.

- src/cities: backend blueprint jobs with stage progress and worker cancellation, persistent city catalog and workspace form documents. Input/output: `src/cities/schema.ts`, forms: `src/cities/forms/schema.ts`. src/cities/CONTRACT.md. Depends on the root generator; the preview server mounts its HTTP handler.

- src/streets/crossings/intervals: safe full-footprint station ranges with prepared exact fields, complete coverage and shared source-edge subdivisions. src/streets/crossings/intervals/CONTRACT.md. Depends on geometry, exact source partition and street construction.

- src/streets/crossings: pre-ground source contacts, prepared city ground fields and proved walking terminals. src/streets/crossings/CONTRACT.md. Depends on Atlas graph, street reservations and geometry; final placement also takes ground, and intervals/ solves full-footprint station ranges.

- src/streets/construction/corridors: exact edge-local roadway, sidewalk and walking query data for consumer conformance. src/streets/construction/corridors/CONTRACT.md. Depends on street construction and geometry; final ground owns rendering and collision.

- src/geom/partition: indexed ownership, reusable prepared exact masks, edge construction, coordinate diagnostics and coverage certificates. src/geom/partition/CONTRACT.md. Depends on Atlas coordinates/errors and the existing Three.js triangulator.

- src/geom/partition/published: independent saved-ground coverage and shared numeric incidence. src/geom/partition/published/CONTRACT.md. Depends on the exact partition kernel and Atlas coordinates/errors.

- src/streets/construction/datum: negotiated source side roles and heights, grade reservations and independent physical-clearance queries. src/streets/construction/datum/CONTRACT.md. Depends on street corridors, Highway envelopes, geometry and exact source-partition queries.

- src/streets/alleys: block cuts with real surrounding-street terminals inside the reserved domain. src/streets/alleys/CONTRACT.md. Depends on street domain, Atlas graph paths and geometry.

- src/streets/construction/highway: early highway envelopes and later obstacle-aware supports. src/streets/construction/highway/CONTRACT.md. Depends on Atlas structure types and geometry; root route selection consumes its runs.

- src/streets/domain: reserves complete street widths inside city land and constrains tracing and graph edits. src/streets/domain/CONTRACT.md. Depends on street construction, geometry and the Atlas graph contract.

- test/runtime: native event-loop turns between completed tests. test/runtime/CONTRACT.md. Depends on Vitest's public runner and Node timers; selected by vite.config.ts.

- src/streets/construction/paving: shared-source fitted slabs, integer group offsets, curb stations and saved ownership validation. src/streets/construction/paving/CONTRACT.md. Depends on street construction, crossing construction, exact partition and published coverage; finish settings come from the caller.

- src/geom: polygon operations, exact contacts, complete coverage and numeric-view diagnostics. src/geom/CONTRACT.md. Depends on root Atlas coordinates, source-partition support enclosures and the existing integer clipping library.
- atlas (root): city blueprint from shared street modules, buildable parcels, transit, checked ground and sparse furniture fitted to paved land. CONTRACT.md, schemas in schema/, generator in src/, optional stage progress in `schema/progress.ts`, reusable CLI at dist/cli.mjs. Depends on street layout/modules, geometry, crossing construction and highway envelopes; mirrors the Interior core-feasibility and Exterior floor-constant contracts.
  - `JunctionGround`: shared beveled gutter, curb and paved returns plus original-arm fitting fields and corner transition supports; uses original contacts, Datum roles and run stations through the retained ground partition. Root CONTRACT and `schema/junction-ground.ts`.
- src/hydro: deterministic water, shoreline bands, land exclusions and exact bridge/tunnel contact reservations. src/hydro/CONTRACT.md. Depends on the root blueprint, geometry, errors and street construction corridors.
- src/ui: URL-selected creation and city inspection, template dropdown, blocking generation progress and cancellation. Input: `src/cities/forms/schema.ts`, jobs: `src/cities/schema.ts`, output: mounted DOM and component events. src/ui/CONTRACT.md. Depends on the city catalog, root blueprint, street modules, fitted paving and Engine exterior/manifest contracts.
- src/zoning: district population forecasts, use eligibility and complete rectangular or lot-following footprints on the published building grid. src/zoning/CONTRACT.md. Depends on Atlas geometry and mirrored Interior core feasibility; Buildability consumes its hosting policy.
- src/transit: bus service and early rail plans with full sidewalk-connected subway bays. src/transit/CONTRACT.md. Depends on street construction and zoning capacity; reservations/ owns entrance land geometry.
- src/streets/construction: road profiles and normalized per-side curb, gutter and paved dimensions before parcels. src/streets/construction/CONTRACT.md. Depends on the Atlas graph, geometry and district contracts; corridor format support governs production reservations.

## Measurements

- [Generation](PERFORMANCE.md): full-city and HTTP worker timings, stage CPU costs and bounded reproduction.
