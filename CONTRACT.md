# CONTRACT: atlas

Purpose: deterministically generates the 2D city blueprint (districts, streets with sidewalks, typed parcels with 3D envelopes, transit) from a seed and parameters.

Status: draft v0.11. Shapes are stable enough to build against; additive fields may come, breaking changes go through the orchestrator.

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
- `meta`: schema version, seed, resolved params, bounds, the city grid angle, irregular city boundary polygon.
- `districts`: kind (downtown, commercial, residential, industrial, mixed), wealth tier, boundary (a rectangle on the city grid, clipped to the city outline), floor cap.
- `streets`: planar graph of nodes and edges; each edge has class (`street` | `road` | `highway` | `alley`), centerline path (curves as polylines), carriageway width, per-side sidewalk widths, and `level` (meters above the ground plane: 0 at grade, 8 on a highway deck, [src/levels.ts](src/levels.ts)); pedestrian crossings at intersections; traffic signals, one head per junction arm with the mast that carries it; `planting`, one flat list of street furniture points for the whole city, each with its `edgeId`, its `kind` (`tree` | `pole` | `bin`, a closed set: skip a kind you do not know rather than draw it wrong) and the spacing its stretch runs at; and `highwayStructures`, one construction record per maximal highway run with its ordered edge IDs, continuous path, width, level, deck thickness, ramp lengths and support columns. An alley is pedestrian only: carriageway 0, 3 to 5 m of ground, all of it sidewalk, cut through long blocks (dense in poor and commercial districts, elsewhere only as a mid-block connector).
- `blocks`: street-bounded faces with a curb strip, sidewalk strip polygons, contained parcels, open areas. Curb corners at intersections carry a rounded return.
- `parcels`: type (residential, hotel, offices, corpo, hospital, clinic, police, military, factory, commerce, mall, restaurant, coffee_shop), tier (poor, mid, rich, high_rich), lot polygon, footprint polygon (the lot inset by the type's setback and trimmed to the band the type needs), street access point, 3D envelope (min/max floors, nominal floor height and max height; real per-floor elevations are owned by exterior).
- `transit`: bus stops and routes over street edges; train and subway stations and lines, each with its `level` (trains at grade, subways at -12 m) and full corridor `width` (4 m train bed, 6 m subway tunnel diameter). A station publishes its platform footprint in plan with the vertical extent of its box (`box.bottom` the platform floor, `box.top` its ceiling: 5 m of headroom underground, 3 m at grade), its street-level entrances on the sidewalk beside it, and, underground, one shaft per entrance: a footprint on the sidewalk running from grade down to the platform, with a passage at platform level from its foot to the platform (empty where the shaft lands on the platform). A station at grade publishes no shaft.
- `volumetric`: low poly city for map previews: one prism per parcel plus ground cover polygons (roadway, curb, sidewalk, block, open).
- `stats`: population estimate, parcel counts per type, per district.

## Errors
Closed set, thrown as `AtlasError { code, message, details? }` ([schema/blueprint.ts](schema/blueprint.ts)):
- `E_INVALID_PARAMS`: params fail validation; message names the field.
- `E_UNSATISFIABLE`: params cannot yield a coherent city (e.g. size too small for the district count).
- `E_INVARIANT`: post-generation coherence check failed; atlas bug, report with seed and params.

## Invariants
- Bus stops keep the researched spacing in a city 1.6 km across or larger and close in proportionally below that, so a small city still runs routes.
- Planar streets: when the traced network leaves two faces sharing ground, the streets grow again from the next seed in line (three tries), and a city that never planarizes refuses with `E_UNSATISFIABLE`. Alleys are cut into that network only while they keep it planar; a set of alleys that would leave two faces sharing ground is dropped and the city keeps its blocks whole.
- Street pattern: every gridded district shares one city grid angle, so blocks stay square and monotonous across districts. The tensor field applies no random noise rotation. A downtown turns radial only when `irregularity` is 0.4 or more, and the boundary bends streets only in proportion to `irregularity`. Default size is 1000 x 1000 m and default irregularity is 0.35; 0.4 and up rings the downtown.
- District shape follows that same grid: the planned centers are halved by cuts perpendicular to a grid axis, so a district is a rectangle in grid space clipped to the city outline. `irregularity` is the only thing that leaves the grid: it slides a cut off the midpoint by up to a quarter of the gap it splits and leans it by up to 15 degrees, both in proportion. At irregularity 0 every cut is exactly on the grid.
- Levels are the one place height lives for networks: a consumer stacks highway decks, tracks and platforms from `level`, never from class.
- A highway is a through route: every highway chain ends either at a junction with other highway arms or within 30 m of the city boundary, so a deck never dead-ends over a block. A chain that stops inside the city is demoted to `road` before widths and blocks are read.
- Every highway edge belongs to exactly one `streets.highwayStructures` record. Its ramps rise only at city-edge termini. Its 2 x 2 m supports stand under the flat deck at no more than 30 m intervals, from ground to the deck underside; a support moves across the deck or shifts the pitch backward where grade infrastructure crosses it. Each shift is bounded by the preceding support, so placement always advances or fails with `E_INVARIANT`. Decks keep 1 m of construction clearance beyond each edge from every building footprint. Support footprints never enter a building footprint, grade rail corridor or subway entrance shaft. All support centers are on the 1 mm coordinate grid.
- IDs are globally unique across the whole blueprint (disjoint prefixes per collection).
- Street graph is connected; every parcel's access point lies on a sidewalk of its access edge.
- Every edge is a real run of street: its two nodes differ, no path point repeats, and no vertex turns more than 120 degrees. A sharper turn would fold the edge's sidewalk band back over its own roadway.
- Sidewalks are continuous along every street and road, linked across intersections by crossings.
- Traffic signals are junction-wide: a junction where three or more streets meet at grade and at least one is a road carries one head on every one of its arms, or none at all. A highway is a deck passing over and an alley carries no vehicle, so neither counts as an arm nor takes a head. A head's pole stands on the kerb its approach keeps to (right-hand traffic), `facing` is the unit direction it looks back down that arm, and `mast` reaches square to it across the approach lanes to the roadway centerline (`carriageway/2 + curb + sidewalk/2`: 4.4 m on a street, 6.75 m on a road).
- Street furniture stands in the kerb-side furnishing strip of a sidewalk, never in the walking line: 8 m apart in downtown and commercial districts, 12 m elsewhere ([src/streets/Planting.ts](src/streets/Planting.ts)), a light pole every third point, and always 6 m clear of a crossing, a bus stop, a station entrance and a parcel access point. Streets and roads carry it; an alley has no kerb and a highway no sidewalk.
- An alley has no carriageway, a sidewalk on both sides summing to 3 to 5 m (the bands of the two blocks it separates, which meet at its centerline), and carries no bus stop and no bus route: vehicles never enter one.
- Every stop and station belongs to at least one route or line; every route and line serves at least 2 stops/stations; a line that cannot reach 2 stations is dropped together with the stations it would have served; each rail network is connected; station entrances lie on sidewalks.
- Grade rail is planned before parcels. Its track bed and station platforms reserve 1 m of construction clearance from every building footprint. A train platform remains outside the highway deck corridor, while crossing track can pass below it between supports. Subway entrances select a clear sidewalk position and their shafts remain outside building footprints. Grade structures never share ground with a highway support: the support moves laterally under its deck or shifts the following 30 m pitch backward.
- A station is walkable end to end: its platform is a simple ring covering the station's position; underground it carries one shaft per entrance, each running from grade to the platform's level, standing on its entrance, and reaching the platform directly or through its passage. An underground entrance is at most 30 m from its platform: NFPA 130 caps the walk from the platform's most remote point to the street at 100 m, and half a 140 m platform takes 70 of them. Platform sizes are researched ([src/transit/stations.ts](src/transit/stations.ts)): 140 x 8 m metro island, 180 x 6 m regional.
- Parcels never overlap; parcels, sidewalk and open areas cover their block; ground surfaces cover the city without gaps.
- The volumetric ground cover is a partition: roadway, curb, sidewalk, block and open polygons are pairwise disjoint. Coordinates live on a 1 mm grid, so surfaces sharing a boundary may report a sliver there; nothing overlaps by a band 1 cm or wider.
- The curb is a ground surface of its own: the outer 0.15 m of the block, between roadway and sidewalk ([src/streets/widths.ts](src/streets/widths.ts)). Block, curb, sidewalk and interior are offsets of one closed ring. Boolean source edges shorter than 0.5 m are removed before the return is built, and curb fragments below a 0.5 m run become sidewalk, so the kerb has no direction flips or slivers. It runs unbroken through every junction return with both its edges parallel to it. An alley borders no roadway, so it has no kerb: those stretches are sidewalk. The per-edge sidewalk width includes the kerb at its outer edge.
- Block outlines and sidewalk polygons are simple rings (3+ points, real area, no crossing edges); every convex curb corner with room for a 0.6 m return is rounded by an arc of 1.5 to 3 m.
- Feature toggles are respected: a disabled feature produces no entities of that kind.
- Every parcel footprint hosts the core rectangle its type needs, derived from interior's published core feasibility ([src/zoning/core.ts](src/zoning/core.ts) mirrors the constants of `../interior/schemas/core-feasibility.json`; a test fails when that file moves). A rectangle is a core mode's band length by its plate depth, with the stair shaft sized for the longest flight the recipe allows, plus one 0.5 m snap (the corridor face and the core start land on interior's grid) and twice the deepest facade (0.62 m) on both axes; it fits in either orientation. Walkup 11.14 x 9.74 m, walkup with two stairs 17.64 x 9.74 m, compact elevator core 12.14 x 13.74 m, standard elevator core 20.14 x 9.74 m. A heavy type (offices, corpo, hotel, hospital, mall, factory) hosts the compact rectangle; a light type (residential, commerce, restaurant, coffee_shop, clinic, police, military) hosts the walkup rectangle, and one of the two-stair rectangles when its footprint exceeds 460 m2.
- Every parcel footprint keeps its type's band end to end, the short side of its rectangle: `HEAVY_BAND` 12.14 m, `LIGHT_BAND` 9.74 m ([src/zoning/bands.ts](src/zoning/bands.ts)). The band is the width between the footprint's two long sides along the whole footprint, where an oblique end cut is a cap and not a narrowing. The zoner assigns a lot only types whose band it hosts; a heavy type whose footprint cannot host its rectangle is retyped to the district's main light type (commerce in downtown, commercial and industrial districts, residential in residential and mixed ones); a lot hosting no rectangle merges into a neighbour parcel or becomes open area.
- Envelope floors stay within what the hosted core allows: no cap with an elevator rectangle, 6 floors with the two-stair walkup rectangle, 4 with the walkup rectangle alone.
- Every envelope admits at least one floor at the minimum floor height of its type's family, mirrored from exterior's floor constants: 2.6 residential, 2.8 hotel, 3.4 offices, 3.6 corpo, 3.8 hospital and clinic, 3.0 police and military, 4.5 factory, 3.0 commerce, mall, restaurant and coffee shop.

## Depends on
None.
