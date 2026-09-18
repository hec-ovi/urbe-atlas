# urbe-atlas

Deterministic 2D city map generator. A seed plus a few parameters produce a complete typed city blueprint: districts, streets with real widths and sidewalks, buildable parcels with quality tiers and 3D envelopes, transit networks, optional lagoon, river or sea-coast hydrology, and a low poly volumetric city for previews. Same input, byte-identical JSON.

The plan is rectangles. Blocks and lots are axis-aligned rectangles on the 8 m module, streets are straight segments between rectangular junction boxes, and a city is a few block sizes repeated: two blocks of the same size and zone carry the same lots. The default city is 3 x 3 km and its plan is under 10 MB.

## Run

```
npm ci
npm test                                    # contract tests
npm run preview                             # browser map: pan, zoom, legend, layer toggles
npm run build                               # type check, CLI and production preview
npm run generate -- --seed urbe --out city.json
```

`npm run build:cli` prepares `dist/cli.mjs` for subprocess callers. `npm run generate` writes to the requested output path. `npm run build:cities` prepares the background generation worker. Preview startup builds both Node entries. The browser build lives under `dist/preview/`.

The preview opens creation with a fresh seed and a template dropdown. Its Streets section carries the whole district street design: lane width per road class, the four sidewalk band widths, crossing headroom and the paving finish, with the dimensions the district modules fix stated next to them. Generate city shows completed server stages in a blocking dialog, each named with what it produces, alongside a standing note on what a finished blueprint carries and what it leaves to later stages; Cancel terminates the worker and removes the partial city. Saved cities open at `?city=id`; the Atlas logo returns to creation. Forms load from `/api/forms/creation` and `/api/forms/visualization`. `ATLAS_CITY_DATA_DIR` selects persistent storage, default `.atlas-cities`. Saved blueprints can be opened and downloaded. Generate exteriors starts a separate Engine job for the displayed blueprint; building previews open after verification.

Generator flags: `--size N`, `--max-floors N`, `--no-highways`, `--no-subways`, `--no-alleys`. Only `--seed` is required; everything else has a documented default in `schema/params.ts`.

## In

`generateCity(params)` in TypeScript, or the CLI above. Params are a seed, city size (default 3000 x 3000 m), district count range, floor caps global and per district kind, wealth tier weights, feature toggles for highways, subways, alleys, air and underground tunnels, and optional `hydrology: { type: "lagoon" | "river" | "sea-coast" }`.

## Out

Package 0.10.0 publishes blueprint 0.26.0. District street construction uses uniform 4.2 m sidewalk paving, 2 m-deep parking and blue, red or yellow block finishes. Selected central avenues add 3.4 m ornamental medians outside the traffic lanes. Frontage/corner supports link to the saved ground array, native parking footprints and protected station/highway references. [Reservation contract](src/streets/layout/reservations/CONTRACT.md).

One JSON blueprint (`schema/blueprint.ts`):

- **districts** with kind (downtown, commercial, residential, industrial, mixed), wealth tier and floor cap, each a rectangle on the one city grid, clipped to the city outline
- **streets** as a planar graph: street, road and highway classes with carriageway and sidewalk widths, exact distance-to-height profiles for driveable ramps, level-separated turn groups at overpasses, straight row and column centerlines, pedestrian crossings at intersections, traffic signals with their mast arms, street furniture (trees, light poles, bins) in the kerb-side strip, deterministic highway decks, ramps and support columns kept clear of pedestrian paving
- **blocks**, each a rectangle with a continuous sidewalk ring, a 0.2 m curb, 0.5 m gutter, 2 x 2 m inner panels, 1 x 1 m outer panels and square curb corners at intersections, and **parcels** typed residential through coffee shop, tiered poor to high rich, each with a lot, a footprint that hosts the core rectangle its type needs, derived from interior's core feasibility (13.14 x 13.74 m for elevator types such as offices and hotels, 11.14 x 9.74 m for the rest), a street access point and a 3D envelope whose floors stay within what that core allows
- **transit**: connected subway lines, platforms and reserved street-level entrance bays. Each entrance has a shaft and a continuous 3D route through switchback stairs and a level passage to its platform.
- **hydrology**, when requested: exact water-surface polygons, shoreline paths and construction bands, water material keys, and typed bridge or tunnel contacts where a street or railway crosses the water. Land, buildings and station entrances stay outside the reserved water.
- **standard lot sizes** in `meta.lotSizes`: six rectangles from 16 x 32 m to 56 x 56 m. Every block is subdivided into rows of those sizes, every ordinary parcel names the one it is, and the land a row cannot fill stays open area. 10 to 30 parcels per city are flagged landmarks on their own merged plot, for the hospital, the police station and the singular towers.
- **block templates** in `meta.blockTemplates`: the tiling of each block size and zone the city uses, as lot offsets and sizes. A block names its template, so a consumer builds one block per template and instances it.
- **volumetric**: one prism per parcel plus ground cover polygons, for map rendering; the preview traces floor elevations on each prism without generating hidden caps between floors
- **stats**: population estimate and parcel counts per type and per district

Building envelopes allocate at least 4.5 m per floor for the default 4 m clear height and 0.5 m allowance. Taller building programs retain their nominal pitch.

The generator enforces its own coherence before it returns: every published land and ground ring an axis-aligned rectangle, connected street graph, street edges that never fold back over their own sidewalk band, every parcel reachable from a sidewalk of its access edge, continuous sidewalks linked by crossings, connected subway networks, parcels that never overlap, footprints that host their type's core rectangle behind the shell wall, ground cover that fills the city without overlaps, and water plans that keep buildings and untyped infrastructure contacts out of water. `CONTRACT.md` lists every invariant and the closed error set.

Saved examples live in `samples/`: `city-urbe-tiny.json` (400 m) and `city-urbe.json` (1 km), both at the current blueprint version.

## How it works

Rows and columns determine the main street intersections directly. Road widths and whole 8 m modules determine the block rectangles: one axis carries at most two sizes, and blocks grow with the square root of the city beyond a kilometre. Shared panel, curb, gutter, corner, parking and guardrail modules define the street geometry; the generator tiles each block size and zone once into standard lots, instances that tiling at every block of the same size, and validates the result. The preview renders repeated modules with instanced geometry.

[The box map](docs/INDEX.md) lists the contracts. [Generation measurements](docs/PERFORMANCE.md) record complete-city CPU time, memory and the test conditions.

## In the urbe family

atlas accepts no sibling runtime data, and every other layer starts from its blueprint. Its zoning mirrors [Interior](https://github.com/hec-ovi/interiorforge) core feasibility and [Exterior](https://github.com/hec-ovi/buildingforge) floor minima so every parcel can be built. [connections](https://github.com/hec-ovi/urbe-transit) turns the blueprint into links and movement networks, [simulation](https://github.com/hec-ovi/urbe-population) reads its districts and stats, [naming](https://github.com/hec-ovi/urbe-namer) names its placeholders, and [engine](https://github.com/hec-ovi/urbe-engine) assembles the result. The full picture lives in [urbe](https://github.com/hec-ovi/urbe).
