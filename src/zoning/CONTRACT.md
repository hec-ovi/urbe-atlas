# CONTRACT: zoning

Purpose: assigns compatible building uses and fits buildable footprints to reserved city land.

## In / out

- `FootprintPolicy` takes the [Atlas footprint shape](../../schema/params.ts) and [building grid](../../schema/blueprint.ts): origin, angle in radians and spacing in metres.
- `RectangularFootprint.fit(inset, profile, grid)` returns a complete grid-aligned footprint or `null`. The profile is the type's setback-adjusted hosting requirement. Dimensions and positions are whole grid cells; world corners retain the full forward transform of those cells.
- `FootprintHost(policy).fit(lot, profile)` returns `{footprint, floorCap}` or `null`, caching one run's exact hosting result per lot and profile. `HostingProfile` carries `setback`, minimum `band`, compact-core requirement `heavy` and retained-area share `keep`; `FootprintHost.ts` declares both shapes.
- `Zoning.assign` tests each eligible use through the same hosting policy consumed by final Buildability. A rejected heavy use can take its district's light fallback. Buildability merges an unhosted lot into its longest-boundary neighbor or retains it as open land.

## Invariants

- Rectangles remain inside their setback-adjusted lot and host the required core. No candidate is clipped into another shape.
- Largest whole-cell area wins; equal areas prefer a wider short side, lower grid coordinates, then a wider extent along the first grid axis. Exact boundary fits are retained. Analytic grid-space containment checks the original inset with floating-point transform roundoff only.
- Land outside a footprint retains its lot ownership. Footprint fitting does not modify streets, sidewalks or land-cover boundaries.
- Identical inputs produce identical outputs. `parcel` mode uses the lot-following hosting policy.

## Errors

No fitting rectangle returns `null`; generation uses its existing deterministic fallback or `E_UNSATISFIABLE` result.

## Depends on

- Root Atlas schema and geometry kernel.
- Mirrored Interior core-feasibility constants in `core.ts`.
