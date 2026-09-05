# CONTRACT: hydrology

Purpose: deterministically plans one bounded water body and classifies the exact network portions permitted to cross it.

## Inputs

- Hydrology request: [schema/hydrology-request.schema.json](schema/hydrology-request.schema.json). `planHydrology(request)` accepts the city seed, size, boundary and optional hydrology type (`lagoon`, `river`, or `sea-coast`). An omitted config means no hydrology and consumes no random stream.
- Crossing classification plan: [schema/hydrology-plan.schema.json](schema/hydrology-plan.schema.json). A non-null prior plan is the geometry being classified.
- Crossing paths: [schema/hydrology-crossings.schema.json](schema/hydrology-crossings.schema.json). `{ network, refId, path, width, level, corridor? }` records identify the public corridors. Optional `corridor` contains exact simple CCW constructed polygons, including unequal sides. `withHydrologyStructures(plan, crossings)` intersects them with water. Omission uses the centered full-width path.
- City validation: `checkCityHydrology(blueprint)` accepts the root city schema. A city with `streets.construction` uses the published street corridor geometry; older cities use centered widths.

## Outputs

- Hydrology plan or no value: [schema/hydrology-plan.schema.json](schema/hydrology-plan.schema.json). Each body carries surface polygons, implicitly closed shorelines, water-side bands, elevation, depth and material key. `seedId` identifies its deterministic stream. Each structure names its source and level. With exact input, `corridor` is the authoritative water-contact reservation; `path` spans the nearest source-route stations of its vertices. A cap can project to one repeated endpoint. `width` stays source metadata, never a replacement for the polygon. Width-only inputs publish their clipped centered path without `corridor`.

## Events

- `planHydrology` runs before infrastructure placement so its surfaces can be used as arithmetic exclusions.
- `withHydrologyStructures` runs after paths are known and publishes `bridge` for at-grade/elevated street or train portions and `tunnel` for subway/below-water portions.
- `checkCityHydrology` rejects parcels, stations, entrances and land surfaces overlapping water. It requires exact typed reservations for every street or rail contact and covers every wet highway support with its bridge reservation.

## Errors

- `E_INVALID_PARAMS`: request shape, seed, size, boundary or hydrology type is invalid.
- `E_UNSATISFIABLE`: the city is too small to reserve coherent water and shoreline geometry.
- `E_INVARIANT`: a crossing input or generated plan violates this contract.

## Dependencies

- Atlas blueprint, fixed-point geometry and error contracts.
- [Street construction](../streets/construction/CONTRACT.md): `StreetCorridors.byEdge` supplies each published street's exact constructed footprint.

## Invariants

- Same seed, size, boundary and type produce byte-identical output. The hydrology stream never changes no-water generation.
- Surface and shoreline rings are CCW, finite, non-self-intersecting, snapped to the 1 mm grid and bounded by the requested city extent.
- A shoreline has one construction-band polygon per segment and closes implicitly without a duplicate final point.
- Exact corridor reservations equal the source footprint intersected with its named water body on the 1 mm geometry grid. Shoreline containment checks the geometric remainder outside its 1 mm boundary allowance, independent of contact length. Separate components remain separate structures; land and the clear narrow side are never reserved. Legacy centered crossings retain full-width classification. City validation checks every reservation's geometry, source, kind, width and level.

## How to modify this blackbox safely

Keep all geometry and validation inside `src/hydro`. Update both schemas and this contract together, then run the blackbox tests and the Atlas integration/property tests.
