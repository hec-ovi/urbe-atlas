# CONTRACT: atlas

Purpose: deterministically generates the 2D city blueprint (districts, streets with sidewalks, typed parcels with 3D envelopes, transit) from a seed and parameters.

Status: draft v0.2. Shapes are stable enough to build against; additive fields may come, breaking changes go through the orchestrator.

## Conventions
- Units: meters. Ground plane XZ, +Y up. 2D points are `[x, z]`; heights along +Y.
- Polygons: CCW rings, first point not repeated.
- Determinism: same seed + params, byte-identical blueprint JSON.
- IDs: deterministic strings with a disjoint prefix per collection: `d` district, `n` street node, `e` street edge, `b` block, `p` parcel, `bs` bus stop, `br` bus route, `ts` train station, `tl` train line, `ss` subway station, `sl` subway line.

## In
`generateCity(params: AtlasParams): CityBlueprint`

Params: [schema/params.ts](schema/params.ts). Only `seed` is required; every other field has a documented default (size, irregularity, district count range, max floors global and per district kind, wealth tier weights, feature toggles for highways, trains, subways, air and underground tunnels).

## Out
`CityBlueprint`: [schema/blueprint.ts](schema/blueprint.ts).
- `meta`: schema version, seed, resolved params, bounds, irregular city boundary polygon.
- `districts`: kind (downtown, commercial, residential, industrial, mixed), wealth tier, boundary, floor cap.
- `streets`: planar graph of nodes and edges; each edge has class (`street` | `road` | `highway`), centerline path (curves as polylines), carriageway width, per-side sidewalk widths; pedestrian crossings at intersections.
- `blocks`: street-bounded faces with sidewalk strip polygons, contained parcels, open areas.
- `parcels`: type (residential, hotel, offices, corpo, hospital, clinic, police, military, factory, commerce, mall, restaurant, coffee_shop), tier (poor, mid, rich, high_rich), footprint polygon, street access point, 3D envelope (min/max floors, nominal floor height and max height; real per-floor elevations are owned by exterior).
- `transit`: bus stops and routes over street edges; train and subway stations (with street-level entrances) and lines.
- `volumetric`: low poly city for map previews: one prism per parcel plus ground cover polygons (roadway, sidewalk, block, open).
- `stats`: population estimate, parcel counts per type, per district.

## Errors
Closed set, thrown as `AtlasError { code, message, details? }` ([schema/blueprint.ts](schema/blueprint.ts)):
- `E_INVALID_PARAMS`: params fail validation; message names the field.
- `E_UNSATISFIABLE`: params cannot yield a coherent city (e.g. size too small for the district count).
- `E_INVARIANT`: post-generation coherence check failed; atlas bug, report with seed and params.

## Invariants
- IDs are globally unique across the whole blueprint (disjoint prefixes per collection).
- Street graph is connected; every parcel's access point lies on a sidewalk of its access edge.
- Sidewalks are continuous along every street and road, linked across intersections by crossings.
- Every stop and station belongs to at least one route or line; each rail network is connected; station entrances lie on sidewalks.
- Parcels never overlap; parcels, sidewalk and open areas cover their block; ground surfaces cover the city without gaps.
- Feature toggles are respected: a disabled feature produces no entities of that kind.

## Depends on
None.
