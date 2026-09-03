# CONTRACT: hydrology

Purpose: deterministically plans one bounded water body and classifies the exact network portions permitted to cross it.

## Inputs

- Hydrology request: [schema/hydrology-request.schema.json](schema/hydrology-request.schema.json). `planHydrology(request)` accepts the city seed, size, boundary and optional hydrology type (`lagoon`, `river`, or `sea-coast`). An omitted config means no hydrology and consumes no random stream.
- Crossing classification plan: [schema/hydrology-plan.schema.json](schema/hydrology-plan.schema.json). A non-null prior plan is the geometry being classified.
- Crossing paths: [schema/hydrology-crossings.schema.json](schema/hydrology-crossings.schema.json). Ordered `{ network, refId, path, width, level }` records identify the public city corridors to classify. `withHydrologyStructures(plan, crossings)` clips the centerline span whose full constructed width contacts water.

## Outputs

- Hydrology plan or no value: [schema/hydrology-plan.schema.json](schema/hydrology-plan.schema.json). Each body carries exact surface polygons, implicitly closed shoreline polylines, water-side shoreline bands, elevation, depth and a closed material key. `seedId` identifies the independent deterministic stream. Each permitted crossing names its source network object and carries its exact clipped path and level.

## Events

- `planHydrology` runs before infrastructure placement so its surfaces can be used as arithmetic exclusions.
- `withHydrologyStructures` runs after paths are known and publishes `bridge` for at-grade/elevated street or train portions and `tunnel` for subway/below-water portions.
- `checkCityHydrology` rejects any parcel, station, entrance, highway support or land surface overlapping water and requires an exact typed structure for every full-width street or rail contact.

## Errors

- `E_INVALID_PARAMS`: request shape, seed, size, boundary or hydrology type is invalid.
- `E_UNSATISFIABLE`: the city is too small to reserve coherent water and shoreline geometry.
- `E_INVARIANT`: a crossing input or generated plan violates this contract.

## Dependencies

- Atlas blueprint, fixed-point geometry and error contracts.

## Invariants

- Same seed, size, boundary and type produce byte-identical output. The hydrology stream never changes no-water generation.
- Surface and shoreline rings are CCW, finite, non-self-intersecting, snapped to the 1 mm grid and bounded by the requested city extent.
- A shoreline has one construction-band polygon per segment and closes implicitly without a duplicate final point.
- A crossing exists only for the portion of its source path whose declared full width intersects a named water body. No untyped overlap is permitted by this layer.

## How to modify this blackbox safely

Keep all geometry and validation inside `src/hydro`. Update both schemas and this contract together, then run the blackbox tests and the Atlas integration/property tests.
