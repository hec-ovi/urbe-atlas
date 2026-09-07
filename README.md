# urbe-atlas

Deterministic 2D city map generator. A seed plus a few parameters produce a complete typed city blueprint: districts, streets with real widths and sidewalks, buildable parcels with quality tiers and 3D envelopes, transit networks, optional lagoon, river or sea-coast hydrology, and a low poly volumetric city for previews. Same input, byte-identical JSON.

## Run

```
npm ci
npm test                                    # contract tests
npm run preview                             # browser map: pan, zoom, legend, layer toggles
npm run build                               # type check, CLI and production preview
npm run generate -- --seed urbe --out city.json
```

`npm run build:cli` prepares `dist/cli.mjs` for subprocess callers. `npm run generate` writes to the requested output path. `npm run build:cities` prepares the background generation worker. Preview startup builds both Node entries. The browser build lives under `dist/preview/`.

The preview opens creation with a fresh seed and a template dropdown. Generate city shows completed server stages in a blocking dialog; Cancel terminates the worker and removes the partial city. Saved cities open at `?city=id`; the Atlas logo returns to creation. Forms load from `/api/forms/creation` and `/api/forms/visualization`. `ATLAS_CITY_DATA_DIR` selects persistent storage, default `.atlas-cities`. Saved blueprints can be opened and downloaded. Generate exteriors starts a separate Engine job for the displayed blueprint; building previews open after verification.

Generator flags: `--size N`, `--irregularity X`, `--max-floors N`, `--no-highways`, `--no-subways`, `--no-alleys`. Only `--seed` is required; everything else has a documented default in `schema/params.ts`.

## In

`generateCity(params)` in TypeScript, or the CLI above. Params are a seed, city size, district count range, floor caps global and per district kind, wealth tier weights, feature toggles for highways, subways, alleys, air and underground tunnels, and optional `hydrology: { type: "lagoon" | "river" | "sea-coast" }`.

## Out

One JSON blueprint (`schema/blueprint.ts`):

- **districts** with kind (downtown, commercial, residential, industrial, mixed), wealth tier and floor cap, each a rectangle on the one city grid, clipped to the city outline
- **streets** as a planar graph: street, road and highway classes with carriageway and sidewalk widths, exact distance-to-height profiles for driveable ramps, level-separated turn groups at overpasses, straight row and column centerlines, pedestrian crossings at intersections, traffic signals with their mast arms, street furniture (trees, light poles, bins) in the kerb-side strip, deterministic highway decks, ramps and support columns kept clear of pedestrian paving
- **blocks** with continuous sidewalk rings, a 0.2 m curb, 0.3 m gutter and modeled 1 m panels, and rounded curb corners at intersections, and **parcels** typed residential through coffee shop, tiered poor to high rich, each with a lot, a footprint that hosts the core rectangle its type needs, derived from interior's core feasibility (12.14 x 13.74 m for elevator types such as offices and hotels, 11.14 x 9.74 m for the rest), a street access point and a 3D envelope whose floors stay within what that core allows
- **transit**: connected subway lines, platforms and reserved street-level entrance bays. Each entrance has a shaft and a continuous 3D route through switchback stairs and a level passage to its platform.
- **hydrology**, when requested: exact water-surface polygons, shoreline paths and construction bands, water material keys, and typed bridge or tunnel contacts where a street or railway crosses the water. Land, buildings and station entrances stay outside the reserved water.
- **volumetric**: one prism per parcel plus ground cover polygons, for map rendering; the preview traces floor elevations on each prism without generating hidden caps between floors
- **stats**: population estimate and parcel counts per type and per district

The generator enforces its own coherence before it returns: connected street graph, street edges that never fold back over their own sidewalk band, every parcel reachable from a sidewalk of its access edge, continuous sidewalks linked by crossings, connected subway networks, parcels that never overlap, footprints that host their type's core rectangle behind the shell wall, ground cover that fills the city without overlaps, and water plans that keep buildings and untyped infrastructure contacts out of water. `CONTRACT.md` lists every invariant and the closed error set.

Saved examples live in `samples/`; each records its blueprint version.

## How it works

Rows and columns determine the main street intersections directly. Road widths and whole panel counts determine square and elongated rectangular blocks. Sparse 30/45 degree streets cut individual eligible blocks. Shared panel, curb, gutter, corner, parking and guardrail modules define the street geometry; the generator subdivides the remaining building land and validates the result. The preview renders repeated modules with instanced geometry.

[The box map](docs/INDEX.md) lists the contracts. [Generation measurements](docs/PERFORMANCE.md) record complete-city CPU time, memory and the test conditions.

## In the urbe family

atlas accepts no sibling runtime data, and every other layer starts from its blueprint. Its zoning mirrors [Interior](https://github.com/hec-ovi/interiorforge) core feasibility and [Exterior](https://github.com/hec-ovi/buildingforge) floor minima so every parcel can be built. [connections](https://github.com/hec-ovi/urbe-transit) turns the blueprint into links and movement networks, [simulation](https://github.com/hec-ovi/urbe-population) reads its districts and stats, [naming](https://github.com/hec-ovi/urbe-namer) names its placeholders, and [engine](https://github.com/hec-ovi/urbe-engine) assembles the result. The full picture lives in [urbe](https://github.com/hec-ovi/urbe).
