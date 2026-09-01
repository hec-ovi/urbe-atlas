# CONTRACT: atlas

Purpose: deterministically generates the 2D city blueprint (districts, streets with sidewalks, typed parcels with 3D envelopes, transit) from a seed and parameters.

Status: draft v0.3. Shapes are stable enough to build against; additive fields may come, breaking changes go through the orchestrator.

## Conventions
- Units: meters. Ground plane XZ, +Y up. 2D points are `[x, z]`; heights along +Y.
- Polygons: CCW rings, first point not repeated.
- Determinism: same seed + params, byte-identical blueprint JSON.
- IDs: deterministic strings with a disjoint prefix per collection: `d` district, `n` street node, `e` street edge, `b` block, `p` parcel, `bs` bus stop, `br` bus route, `ts` train station, `tl` train line, `ss` subway station, `sl` subway line.

## In
`generateCity(params: AtlasParams): CityBlueprint`

Params: [schema/params.ts](schema/params.ts). Only `seed` is required; every other field has a documented default (size, irregularity, district count range, max floors global and per district kind, wealth tier weights, feature toggles for highways, trains, subways, alleys, air and underground tunnels).

CLI: `npm run generate -- --seed <seed> --out <file.json> [--size N] [--irregularity X] [--max-floors N] [--no-highways] [--no-trains] [--no-subways] [--no-alleys]` writes the blueprint JSON. Exit 1 on AtlasError (code printed), 2 on usage error.

Samples, committed and test-guaranteed to regenerate byte-identical:
- [samples/city-urbe.json](samples/city-urbe.json): seed `urbe`, default params (full-size city).
- [samples/city-urbe-small.json](samples/city-urbe-small.json): seed `urbe-small`, size 800x800 (village, first complete-city build target).
- [samples/city-urbe-tiny.json](samples/city-urbe-tiny.json): seed `urbe-tiny`, size 400x400, maxFloors 6, highways, trains and subways off (smallest coherent city).

## Out
`CityBlueprint`: [schema/blueprint.ts](schema/blueprint.ts).
- `meta`: schema version, seed, resolved params, bounds, irregular city boundary polygon.
- `districts`: kind (downtown, commercial, residential, industrial, mixed), wealth tier, boundary, floor cap.
- `streets`: planar graph of nodes and edges; each edge has class (`street` | `road` | `highway` | `alley`), centerline path (curves as polylines), carriageway width, per-side sidewalk widths; pedestrian crossings at intersections. An alley is pedestrian only: carriageway 0, 3 to 5 m of ground, all of it sidewalk, cut through long blocks (dense in poor and commercial districts, elsewhere only as a mid-block connector).
- `blocks`: street-bounded faces with sidewalk strip polygons, contained parcels, open areas. Curb corners at intersections carry a rounded return.
- `parcels`: type (residential, hotel, offices, corpo, hospital, clinic, police, military, factory, commerce, mall, restaurant, coffee_shop), tier (poor, mid, rich, high_rich), lot polygon, footprint polygon (the lot inset by the type's setback and trimmed to the band the type needs), street access point, 3D envelope (min/max floors, nominal floor height and max height; real per-floor elevations are owned by exterior).
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
- Every edge is a real run of street: its two nodes differ, no path point repeats, and no vertex turns more than 120 degrees. A sharper turn would fold the edge's sidewalk band back over its own roadway.
- Sidewalks are continuous along every street and road, linked across intersections by crossings.
- An alley has no carriageway, a sidewalk on both sides summing to 3 to 5 m (the bands of the two blocks it separates, which meet at its centerline), and carries no bus stop and no bus route: vehicles never enter one.
- Every stop and station belongs to at least one route or line; every route and line serves at least 2 stops/stations; a line that cannot reach 2 stations is dropped together with the stations it would have served; each rail network is connected; station entrances lie on sidewalks.
- Parcels never overlap; parcels, sidewalk and open areas cover their block; ground surfaces cover the city without gaps.
- The volumetric ground cover is a partition: roadway, sidewalk, block and open polygons are pairwise disjoint. Coordinates live on a 1 mm grid, so surfaces sharing a boundary may report a sliver there; nothing overlaps by a band 1 cm or wider.
- Block outlines and sidewalk polygons are simple rings (3+ points, real area, no crossing edges); every convex curb corner with room for a 0.6 m return is rounded by an arc of 1.5 to 3 m.
- Feature toggles are respected: a disabled feature produces no entities of that kind.
- Every parcel footprint keeps its type's minimum band end to end: the width between its two long sides along the whole footprint, where an oblique end cut is a cap and not a narrowing. `HEAVY_BAND` 12 m for offices, corpo, hotel, hospital, mall and factory (interior's 11 m core band plus up to 0.5 m of shell wall each side), `LIGHT_BAND` 8.5 m for residential, commerce, restaurant, coffee_shop, clinic, police and military ([src/zoning/bands.ts](src/zoning/bands.ts)). The zoner assigns a lot only types whose band it hosts; a heavy type whose footprint still cannot keep the band is retyped to the heaviest type it can host, the district's main light type (commerce in downtown, commercial and industrial districts, residential in residential and mixed ones); a lot that hosts no band merges into a neighbour parcel or becomes open area. No parcel is left with a band its type cannot use.
- Every parcel footprint contains a 7.9 x 5.5 m rectangle (walkup stair core, constants mirrored from interior's core feasibility); the footprint of a heavy type contains a 10.4 x 8.0 m one (elevator/stair core, same mirror).
- Envelopes above 6 floors have a footprint that contains that 10.4 x 8.0 m rectangle; smaller footprints are capped at 6 floors.
- Every envelope admits at least one floor at the minimum floor height of its type's family, mirrored from exterior's floor constants: 2.6 residential, 2.8 hotel, 3.4 offices, 3.6 corpo, 3.8 hospital and clinic, 3.0 police and military, 4.5 factory, 3.0 commerce, mall, restaurant and coffee shop.

## Depends on
None.
