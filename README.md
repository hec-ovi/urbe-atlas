# atlas

Deterministic 2D city map generator. A seed plus parameters produce a complete typed city blueprint: districts, a street hierarchy with real widths and sidewalks, buildable parcels with quality tiers and 3D envelopes, transit networks, and a low poly volumetric city for previews. Same input, byte-identical JSON, generated in well under a second.

## Quick start

```
npm install
npm test           # contract tests
npm run preview    # browser preview: pan, zoom, legend, layer toggles
npm run generate -- --seed urbe --out city.json
```

## What comes out

One JSON blueprint (schema in `schema/blueprint.ts`): districts with kind and wealth tier, a planar street graph (street, road, highway classes with carriageway and sidewalk widths, pedestrian crossings), blocks with continuous sidewalk rings, parcels typed residential to coffee shop with poor to high rich tiers and floor envelopes, bus routes and stops, subway and train lines with stations, ground surfaces and building prisms for map rendering, and per-district statistics.

`CONTRACT.md` is the full surface: parameters, schemas, the closed error set, and the coherence invariants the generator enforces (connected street graph, every parcel reachable from a sidewalk, connected transit networks, gap-free ground coverage).

## How it works

Streets grow as streamlines through a composite tensor field (grid, radial and boundary basis fields), which is what mixes curved, radial and rectangular patterns in one city. Blocks are the faces of the resulting planar graph, parcels come from recursive oriented-box subdivision, and zoning applies researched urban ratios (hospitals, police, commerce per population; floor bands per type and tier). Sources and numbers live in `docs/RESEARCH.md`.

A fixed sample lives at `samples/city-urbe.json`.
