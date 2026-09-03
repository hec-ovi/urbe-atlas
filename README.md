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

`npm run build:cli` prepares `dist/cli.mjs` for a host that invokes Atlas as a subprocess. `npm run generate` executes that artifact without writing inside the Atlas checkout. Preview startup prepares it too. The production browser files live under `dist/preview/`, so either build can run without deleting the other.

The preview generates cities from a form: parameter sets export and import as JSON files, hydrology can reserve a lagoon, river or sea coast, and generation reports its progress or failure. Optional station-access diagnostics stay visible through their shafts and platforms. Right-click a visible feature to keep its measurements in the inspector. A parcel also opens immediately in the configured engine building viewer; its inspector link remains available as a fallback. The default targets the local engine, and an empty URL template disables it.

Generator flags: `--size N`, `--irregularity X`, `--max-floors N`, `--no-highways`, `--no-trains`, `--no-subways`, `--no-alleys`. Only `--seed` is required; everything else has a documented default in `schema/params.ts`.

## In

`generateCity(params)` in TypeScript, or the CLI above. Params are a seed, city size, boundary irregularity, district count range, floor caps global and per district kind, wealth tier weights, feature toggles for highways, trains, subways, alleys, air and underground tunnels, and optional `hydrology: { type: "lagoon" | "river" | "sea-coast" }`.

## Out

One JSON blueprint (`schema/blueprint.ts`):

- **districts** with kind (downtown, commercial, residential, industrial, mixed), wealth tier and floor cap, each a rectangle on the one city grid, clipped to the city outline
- **streets** as a planar graph: street, road and highway classes with carriageway and sidewalk widths, exact distance-to-height profiles for driveable ramps, level-separated turn groups at overpasses, grid-aligned interior centerlines, boundary-following and radial curves where the parameters select them, pedestrian crossings at intersections, traffic signals with their mast arms, street furniture (trees, light poles, bins) in the kerb-side strip, deterministic highway decks, ramps and support columns kept clear of pedestrian paving, plus pedestrian-only alleys (no carriageway, 3 to 5 m of sidewalk) cut through long blocks in poor and commercial districts
- **blocks** with continuous sidewalk rings, a 0.15 m curb strip of their own between roadway and sidewalk, and rounded curb corners at intersections, and **parcels** typed residential through coffee shop, tiered poor to high rich, each with a lot, a footprint that hosts the core rectangle its type needs, derived from interior's core feasibility (12.14 x 13.74 m for elevator types such as offices and hotels, 11.14 x 9.74 m for the rest), a street access point and a 3D envelope whose floors stay within what that core allows
- **transit**: bus stops and routes over street edges, forward-only train and subway paths with their corridor widths, and stations with their platform box and street-level entrances. Each underground entrance publishes its shaft plus a continuous 3D route through switchback stairs and a level passage to a platform handoff. At-grade track and platforms reserve their right-of-way before parcels are cut. Train platforms stay outside highway decks; subway entrances choose sidewalk space clear of buildings.
- **hydrology**, when requested: exact water-surface polygons, shoreline paths and construction bands, water material keys, and typed bridge or tunnel contacts where a street or railway crosses the water. Land, buildings and station entrances stay outside the reserved water.
- **volumetric**: one prism per parcel plus ground cover polygons, for map rendering; the preview traces floor elevations on each prism without generating hidden caps between floors
- **stats**: population estimate and parcel counts per type and per district

The generator enforces its own coherence before it returns: connected street graph, street edges that never fold back over their own sidewalk band, bus routes that stay inside level-compatible junction groups, every parcel reachable from a sidewalk of its access edge, continuous sidewalks linked by crossings, connected rail networks, parcels that never overlap, footprints that host their type's core rectangle behind the shell wall, ground cover that fills the city without overlaps, and water plans that keep buildings and untyped infrastructure contacts out of water. `CONTRACT.md` lists every invariant and the closed error set.

Three samples are committed and tested to regenerate byte-identical: `samples/city-urbe.json` (full size), `samples/city-urbe-small.json` (an 800 m village) and `samples/city-urbe-tiny.json` (a 400 m hamlet with highways, trains and subways off).

## How it works

Streets grow as streamlines through a composite tensor field (grid, radial and boundary basis fields). The field contains no noise rotation: interior centerlines stay on the city axes, while `irregularity` controls the computed boundary bend and enables a radial downtown from 0.4. Every gridded district and every district cut uses the same axes. Blocks are the faces of the resulting planar graph, parcels come from recursive oriented-box subdivision, and zoning applies researched urban ratios: hospitals, police and commerce per population, floor bands per type and tier. Sources and numbers live in `docs/RESEARCH.md`.

## In the urbe family

atlas accepts no sibling runtime data, and every other layer starts from its blueprint. Its zoning mirrors [Interior](https://github.com/hec-ovi/interiorforge) core feasibility and [Exterior](https://github.com/hec-ovi/buildingforge) floor minima so every parcel can be built. [connections](https://github.com/hec-ovi/urbe-transit) turns the blueprint into links and movement networks, [simulation](https://github.com/hec-ovi/urbe-population) reads its districts and stats, [naming](https://github.com/hec-ovi/urbe-namer) names its placeholders, and [engine](https://github.com/hec-ovi/urbe-engine) assembles the result. The full picture lives in [urbe](https://github.com/hec-ovi/urbe).
