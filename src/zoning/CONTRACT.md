# CONTRACT: zoning

Purpose: assigns compatible building uses and fits buildable footprints to reserved city land.

## In / out

- `FootprintPolicy` is `{ grid }` from [FootprintPolicy.ts](FootprintPolicy.ts): the [building grid](../../schema/blueprint.ts) origin, angle in radians and spacing in metres. Footprints are rectangles on that grid.
- `RectangularFootprint.fit(inset, profile, grid)` returns a complete grid-aligned footprint or `null`. The profile is the type's setback-adjusted hosting requirement. Dimensions and positions are whole grid cells; world corners retain the full forward transform of those cells.
- `FootprintHost(policy).fit(lot, profile)` returns `{footprint, floorCap}` or `null`, caching one run's exact hosting result per lot and profile. `HostingProfile` carries `setback`, minimum `band`, compact-core requirement `heavy` and retained-area share `keep`; `FootprintHost.ts` declares both shapes.
- `Zoning.assign` tests each eligible use through the same hosting policy consumed by final Buildability. A rejected heavy use can take its district's light fallback. Buildability merges an unhosted lot into its longest-boundary neighbor or retains it as open land.
- `Zoning.populationForecast(districts)` takes each district's id, kind, tier, floor cap and net land area before subdivision. It returns total and per-district residential capacity, [population-schema.ts](population-schema.ts). Infrastructure uses this forecast; final city population still comes from hosted residential lots.
- `minFloorHeight(type)` and `activeMinFloorHeight(type)` in [floorMinimums.ts](floorMinimums.ts) take [ParcelType](../../schema/blueprint.ts) and return metre pitches: the hard family bound, and the maximum of that bound and the mirrored generation policy's 4 m clear height plus 0.5 m allowance.
- `makeEnvelope(type, tier, districtMaxFloors, rng)` in [envelopes.ts](envelopes.ts) returns [Envelope](../../schema/blueprint.ts). Nominal pitch meets the active minimum; taller type programs retain their pitch. `maxHeight` allocates all `maxFloors` at that pitch, rounded to centimetres. `rng` is the caller's seeded Atlas random stream.

## Invariants

- Rectangles remain inside their setback-adjusted lot and host the required core. No candidate is clipped into another shape.
- Heavy footprints contain a 13.14 by 13.74 m compact-core rectangle, including the mirrored 3 m stair columns, grid clearance and facade lining. Whole-cell fits on the default 0.5 m grid need at least 13.5 by 14 m before setbacks.
- Largest whole-cell area wins; equal areas prefer a wider short side, lower grid coordinates, then a wider extent along the first grid axis. Exact boundary fits are retained. Analytic grid-space containment checks the original inset with floating-point transform roundoff only.
- Land outside a footprint retains its lot ownership. Footprint fitting does not modify streets, sidewalks or land-cover boundaries.
- Identical inputs produce identical outputs.
- Population forecasts reuse the residential use share, tier probabilities, expected envelope floors and resident density of parcel zoning. Streets, water and existing infrastructure are excluded from input land. Facility quotas and individual lot feasibility have not yet reduced that capacity.

## Errors

No fitting rectangle returns `null`; generation uses its existing deterministic fallback or `E_UNSATISFIABLE` result.
Malformed district capacity data fails with `E_INVALID_PARAMS`.

## Depends on

- Root Atlas schema and geometry kernel.
- Mirrored Interior core-feasibility constants in `core.ts`.
- Mirrored Exterior hard family minima and generation policy from its public `schemas/floor-constants.json`; runtime generation reads only local constants.
