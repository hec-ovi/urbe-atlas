# Box map

- src/streets/layout/medians: constructs selected reserved avenue islands with 2 m paved centers, rounded ends, curb/gutter and ornament anchors. Input/output: `src/streets/layout/medians/schema.ts`. src/streets/layout/medians/CONTRACT.md. Depends on layout, module records and geometry; reserves no traffic lanes.

- src/streets/layout/diagonal-candidates: independent straight corridor proposals between authored rectangle faces, with complete mouth clearance and allowed-land coverage. Input/output: `src/streets/layout/diagonal-candidates/schema.ts`. src/streets/layout/diagonal-candidates/CONTRACT.md. Depends on Atlas coordinates/errors and exact source partition; applies no city changes.

- src/streets/layout/reservations: links source and district frontage dimensions, native parking and protected infrastructure to exact saved ground owners. Input/output: `src/streets/layout/reservations/schema.ts`. src/streets/layout/reservations/CONTRACT.md. Depends on layout, modules, Atlas blueprint and geometry.

- src/streets/layout/underpasses: source and district sidewalks beneath clear highways, with authored corner handoffs and explicit shoreline exclusions. Input/output: `src/streets/layout/underpasses/schema.ts`. src/streets/layout/underpasses/CONTRACT.md. Depends on layout, underpass modules, physical highway clearance and geometry; CityLayout consumes its block paving.

- src/streets/construction/modules/underpass: complete source or district sidewalks across an elevated highway opening, fitted to physical corner dimensions. Input/output: `src/streets/construction/modules/underpass/schema.ts`. src/streets/construction/modules/underpass/CONTRACT.md. Depends on street modules and geometry.

- src/landmarks: exact floors for selected elevator-hosted commercial towers, with saved parameters that reproduce the result. Input: `src/landmarks/schema.ts`, output: `schema/blueprint.ts`. src/landmarks/CONTRACT.md. Depends on the root blueprint and its zoning hosting guarantees; the root generator applies it before validation.

- src/streets/construction/modules/diagonal: local 30/45 degree block-cut templates with authored frontage supports, complete panels and rounded junction returns. Input/output: `src/streets/construction/modules/diagonal/schema.ts`. src/streets/construction/modules/diagonal/CONTRACT.md. Depends on street modules and geometry.

- src/streets/layout: rectangular street grid sized in complete panel groups, with uniform district blocks, selected central avenue median reservations, an interior highway, outer sidewalks that stop at excluded land, and whole-module parking. Input/output: `src/streets/layout/schema.ts`. src/streets/layout/CONTRACT.md. Depends on street construction dimensions, street modules and Atlas seed streams.

- src/streets/construction/modules: dimensioned panels, curbs, gutters, corners and parking, with source and district construction formats on shared 2 m stations; the perimeter ring skips every unit standing on excluded land. Input/output: `src/streets/construction/modules/schema.ts`. src/streets/construction/modules/CONTRACT.md. Depends on Atlas coordinates, errors and geometry; construction and renderers consume its repeated placements.

- src/cities: backend blueprint jobs with stage progress and worker cancellation, persistent city catalog and workspace form documents. Input/output: `src/cities/schema.ts`, forms: `src/cities/forms/schema.ts`. src/cities/CONTRACT.md. Depends on the root generator; the preview server mounts its HTTP handler.

- src/streets/crossings/intervals: safe full-footprint station ranges with prepared exact fields, complete coverage and shared source-edge subdivisions. src/streets/crossings/intervals/CONTRACT.md. Depends on geometry, exact source partition and street construction.

- src/streets/crossings: pre-ground source contacts, prepared city ground fields and proved walking terminals. src/streets/crossings/CONTRACT.md. Depends on Atlas graph, street reservations and geometry; final placement also takes ground, and intervals/ solves full-footprint station ranges.

- src/streets/construction/corridors: exact edge-local roadway, sidewalk and walking query data for consumer conformance. src/streets/construction/corridors/CONTRACT.md. Depends on street construction and geometry; final ground owns rendering and collision.

- src/geom/partition: indexed ownership, reusable prepared exact masks, edge construction, coordinate diagnostics and coverage certificates. src/geom/partition/CONTRACT.md. Depends on Atlas coordinates/errors and the existing Three.js triangulator.

- src/geom/partition/published: independent saved-ground coverage and shared numeric incidence. src/geom/partition/published/CONTRACT.md. Depends on the exact partition kernel and Atlas coordinates/errors.

- src/streets/construction/datum: negotiated source side roles and heights, grade reservations and independent physical-clearance queries. src/streets/construction/datum/CONTRACT.md. Depends on street corridors, Highway envelopes, geometry and exact source-partition queries.

- src/streets/alleys: block cuts with real surrounding-street terminals inside the reserved domain. src/streets/alleys/CONTRACT.md. Depends on street domain, Atlas graph paths and geometry.

- src/streets/construction/highway: early highway envelopes and supports fitted at exact obstacle contact stations. Input/output: `src/streets/construction/highway/schema.ts`. src/streets/construction/highway/CONTRACT.md. Depends on Atlas structure types and geometry; root route selection consumes its runs.

- src/streets/domain: reserves complete street widths inside city land and constrains tracing and graph edits. src/streets/domain/CONTRACT.md. Depends on street construction, geometry and the Atlas graph contract.

- test/runtime: native event-loop turns between completed tests. test/runtime/CONTRACT.md. Depends on Vitest's public runner and Node timers; selected by vite.config.ts.

- src/streets/construction/paving: curb-only fitted slabs, integer group offsets, curb stations and saved ownership validation. src/streets/construction/paving/CONTRACT.md. Depends on street construction, crossing construction, exact partition and published coverage; finish settings come from the caller.

- src/geom: polygon operations, exact contacts, complete coverage and numeric-view diagnostics. src/geom/CONTRACT.md. Depends on root Atlas coordinates, source-partition support enclosures and the existing integer clipping library.
- atlas (root): city blueprint from shared district street modules, buildable parcels, transit, checked ground and sparse furniture fitted to paved land. CONTRACT.md, schemas in schema/, generator in src/, saved source street reservations and independent diagonal candidates, optional stage progress in `schema/progress.ts`, reusable CLI at dist/cli.mjs. Depends on street layout/modules, geometry, crossing construction and highway envelopes; mirrors the Interior core-feasibility and Exterior floor-constant contracts.
  - `JunctionGround`: shared beveled gutter, curb and paved returns plus original-arm fitting fields and corner transition supports; uses original contacts, Datum roles and run stations through the retained ground partition. Root CONTRACT and `schema/junction-ground.ts`.
- src/hydro: deterministic water, shoreline bands, land exclusions and exact bridge/tunnel contact reservations. src/hydro/CONTRACT.md. Depends on the root blueprint, geometry, errors and street construction corridors.
- src/ui: URL-selected creation and city inspection, template dropdown, editable street design, blocking generation progress and cancellation. Input: `src/cities/forms/schema.ts`, jobs: `src/cities/schema.ts`, output: mounted DOM and component events. src/ui/CONTRACT.md. Depends on the city catalog, root blueprint, street modules, fitted paving and Engine exterior/manifest contracts.
- src/blocks: standard lot catalog and the row tiler that cuts every block into it, plus landmark plots and the hosting check that turns an unbuildable lot into open area. Input/output: `src/blocks/StandardLots.ts`, `schema/blueprint.ts`. Depends on Atlas geometry and the zoning hosting policy; the root generator zones what it produces.

- src/zoning: district population forecasts, use eligibility, complete footprints with 3 m compact stair columns and floor envelopes with 4 m default clear height. src/zoning/CONTRACT.md. Inputs/outputs: `schema/blueprint.ts`, `schema/params.ts`, `src/zoning/population-schema.ts`. Depends on Atlas geometry, mirrored Interior core feasibility and Exterior floor policy; Buildability consumes its hosting policy.
- src/transit: subway plans with full sidewalk-connected entrance bays. src/transit/CONTRACT.md. Depends on street construction and zoning capacity; reservations/ owns entrance land geometry.
- src/streets/construction: road profiles, avenue median widths and normalized per-side curb, gutter and paved dimensions before parcels. src/streets/construction/CONTRACT.md. Input: `src/streets/construction/schema/design.ts`, output: `src/streets/construction/schema/sections.ts`. Depends on Atlas graph, geometry, districts and street module formats; corridor format support governs production reservations.

- [Design references](RESEARCH.md): geometry, subway dimensions and urban statistics behind the published contracts.

## Measurements

- [Generation](PERFORMANCE.md): full-city and HTTP worker timings, stage CPU costs and bounded reproduction.
