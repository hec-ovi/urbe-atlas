# urbe-atlas

Deterministic 2D city map generator. A seed plus a few parameters produce a complete typed city blueprint: districts, a street hierarchy with real widths and sidewalks, buildable parcels with quality tiers and 3D envelopes, transit networks, and a low poly volumetric city for previews. Same input, byte-identical JSON: a 3 km city takes about a second, a village a tenth of that.

## Run

```
npm install
npm test                                    # contract tests
npm run preview                             # browser map: pan, zoom, legend, layer toggles
npm run generate -- --seed urbe --out city.json
```

The preview generates cities from a form: parameter sets export and import as JSON files, generation runs behind a progress cover with failures shown as notifications, and a parcel click can open that building elsewhere through a URL template (`{seed}`, `{parcelId}`, `{type}`, ...), off until you set one.

Generator flags: `--size N`, `--irregularity X`, `--max-floors N`, `--no-highways`, `--no-trains`, `--no-subways`, `--no-alleys`. Only `--seed` is required; everything else has a documented default in `schema/params.ts`.

## In

`generateCity(params)` in TypeScript, or the CLI above. Params are a seed, city size, boundary irregularity, district count range, floor caps global and per district kind, wealth tier weights, and feature toggles for highways, trains, subways, alleys, air and underground tunnels.

## Out

One JSON blueprint (`schema/blueprint.ts`):

- **districts** with kind (downtown, commercial, residential, industrial, mixed), wealth tier and floor cap, each a rectangle on the one city grid, clipped to the city outline
- **streets** as a planar graph: street, road and highway classes with carriageway and sidewalk widths, curved centerlines, pedestrian crossings at intersections, traffic signals with their mast arms, street furniture (trees, light poles, bins) in the kerb-side strip, deterministic highway decks, ramps and support columns, plus pedestrian-only alleys (no carriageway, 3 to 5 m of sidewalk) cut through long blocks in poor and commercial districts
- **blocks** with continuous sidewalk rings, a 0.15 m curb strip of their own between roadway and sidewalk, and rounded curb corners at intersections, and **parcels** typed residential through coffee shop, tiered poor to high rich, each with a lot, a footprint that hosts the core rectangle its type needs, derived from interior's core feasibility (12.14 x 13.74 m for elevator types such as offices and hotels, 11.14 x 9.74 m for the rest), a street access point and a 3D envelope whose floors stay within what that core allows
- **transit**: bus stops and routes over street edges, train and subway stations with their platform box, street level entrances and, underground, a shaft per entrance down to the platform, plus their lines
- **volumetric**: one prism per parcel plus ground cover polygons, for map rendering
- **stats**: population estimate and parcel counts per type and per district

The generator enforces its own coherence before it returns: connected street graph, street edges that never fold back over their own sidewalk band, every parcel reachable from a sidewalk of its access edge, continuous sidewalks linked by crossings, connected rail networks, parcels that never overlap, footprints that host their type's core rectangle behind the shell wall (a lot too small for a type gets a lighter one, or none), ground cover that fills the city without gaps and without any surface overlapping another, simple block and sidewalk rings. `CONTRACT.md` lists every invariant and the closed error set.

Three samples are committed and tested to regenerate byte-identical: `samples/city-urbe.json` (full size), `samples/city-urbe-small.json` (an 800 m village) and `samples/city-urbe-tiny.json` (a 400 m hamlet with highways, trains and subways off).

## How it works

Streets grow as streamlines through a composite tensor field (grid, radial and boundary basis fields), which is what mixes curved, radial and rectangular patterns in one city. Every gridded district and every district cut sits on one city grid angle, so blocks stay square; `irregularity` is what lets a cut lean off it. Blocks are the faces of the resulting planar graph, parcels come from recursive oriented-box subdivision, and zoning applies researched urban ratios: hospitals, police and commerce per population, floor bands per type and tier. Sources and numbers live in `docs/RESEARCH.md`.

## In the urbe family

atlas is the root of the world: nothing feeds it, and every other layer starts from its blueprint. [urbe-transit](../urbe-transit) turns it into links and movement networks, [urbe-population](../urbe-population) reads its districts and stats, [urbe-namer](../urbe-namer) names its placeholders, and [urbe-engine](../urbe-engine) assembles the result. Each parcel becomes a real building through [buildingforge](../buildingforge). The full picture lives in [urbe](../urbe).
