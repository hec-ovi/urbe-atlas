# Atlas skill

Atlas plans a city from a seed and a few parameters: districts, streets with their lanes and sidewalks, blocks, typed parcels with building volumes, highways, subways, and the paths cars and people follow. It publishes physical street modules and calls no LLM. The same request always returns the same city.

## Call it

- Library: `import { generateCity } from 'atlas'`, then `generateCity(params)` returns the blueprint.
- CLI: `npm run build:cli` once, then `npm run generate -- --seed <seed> --out <file.json> [--size N] [--max-floors N] [--no-highways] [--no-subways] [--no-alleys]`.
- HTTP, from the preview server: `POST /api/cities` with the same parameters queues a job and returns its record; `GET /api/cities/:id` reports its state; `GET /api/cities/:id/blueprint` returns the finished blueprint.

## Request

Only `seed` is required.

| Field | Default | Meaning |
| --- | --- | --- |
| `seed` | required | String or number. |
| `size` | `{ width: 3000, depth: 3000 }` | City extent in meters. |
| `districtCount` | scales with area | `[min, max]` districts. |
| `maxFloors` | 40 | Global floor cap. |
| `maxFloorsByDistrict` | none | Floor cap per district kind: downtown, commercial, residential, industrial, mixed. |
| `tierWeights` | poor 0.3, mid 0.45, rich 0.2, high_rich 0.05 | Wealth mix. |
| `features` | all true | `highways`, `subways`, `alleys`, `airTunnels`, `undergroundTunnels`. |
| `hydrology` | none | `{ type: 'lagoon' \| 'river' \| 'sea-coast' }`. |

`streetDesign`, `pavingDesign` and `landmarkFloors` are advanced; see CONTRACT.md.

## Response

Package 0.12.4 returns blueprint 0.26.0 and architecture 1.0.0. Default district streets use uniform 4.2 m paving, 0.2 m curbs, 0.5 m gutters and a 2 m-deep parking bay, ending in a 45 degree return at each end, on one kerb of every street. Whole-block finishes and road district styles are explicit. Selected central avenues reserve 3.4 m ornamental islands separately from traffic lanes.

The plan is rectangles: blocks and lots are axis-aligned rectangles on the 8 m module, streets are straight segments between rectangular junction boxes, and every published land or ground ring has four corners.

A `CityBlueprint`: `meta`, `districts`, `streets` (node and edge graph), `architecture` (movement plan), `blocks`, `parcels`, `transit`, optional `hydrology`, `volumetric`, `stats` and `report`. Parcels carry type, wealth tier, lot, rectangular footprint, street access and a height envelope of at least two floors; a `park` parcel carries the lot alone, with no footprint and no envelope. `report.degraded` lists every element published in its simplest valid form, with its id, kind and reason. An ordinary parcel also names its `lotSize`, one of the six rectangles in `meta.lotSizes`; a `landmark` parcel keeps its own plot instead. A block names the `meta.blockTemplates` entry it is tiled from, so two blocks of the same size, zone and street tier carry the same lots and a consumer builds the tiling once. A rich or high_rich parcel's lot is at least 24 m on its short side. The movement plan carries each street's reserved widths, driving lanes and walking lanes, the legal turns at every node, crossings with their signal phases, and the ramps up to highway decks. Full shapes: CONTRACT.md and `schema/`.

## Errors

- `E_INVALID_PARAMS`: a parameter fails validation; the message names the field.
- `E_UNSATISFIABLE`: the parameters cannot make a coherent city, for example a size too small for its districts.
- `E_INVARIANT`: an Atlas bug. Report the seed and parameters.

## Example

"A 2 km city capped at 30 floors, no highways, and every coffee shop in it":

```ts
const city = generateCity({ seed: 'neon-2', size: { width: 2000, depth: 2000 }, maxFloors: 30, features: { highways: false } });
const coffee = city.parcels.filter(parcel => parcel.type === 'coffee_shop');
const walking = city.architecture!.edges.find(edge => edge.edgeId === 'e12')?.walkingLanes;
```
