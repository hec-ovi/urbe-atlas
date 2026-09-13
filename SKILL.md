# Atlas skill

Atlas plans a city from a seed and a few parameters: districts, streets with their lanes and sidewalks, blocks, typed parcels with building volumes, highways, subways, and the paths cars and people follow. It builds no surfaces and calls no LLM. The same request always returns the same city.

## Call it

- Library: `import { generateCity } from 'atlas'`, then `generateCity(params)` returns the blueprint.
- CLI: `npm run build:cli` once, then `npm run generate -- --seed <seed> --out <file.json> [--size N] [--max-floors N] [--no-highways] [--no-subways] [--no-alleys]`.
- HTTP, from the preview server: `POST /api/cities` with the same parameters queues a job and returns its record; `GET /api/cities/:id` reports its state; `GET /api/cities/:id/blueprint` returns the finished blueprint.

## Request

Only `seed` is required.

| Field | Default | Meaning |
| --- | --- | --- |
| `seed` | required | String or number. |
| `size` | `{ width: 1000, depth: 1000 }` | City extent in meters. |
| `districtCount` | scales with area | `[min, max]` districts. |
| `maxFloors` | 40 | Global floor cap. |
| `maxFloorsByDistrict` | none | Floor cap per district kind: downtown, commercial, residential, industrial, mixed. |
| `tierWeights` | poor 0.3, mid 0.45, rich 0.2, high_rich 0.05 | Wealth mix. |
| `features` | all true | `highways`, `subways`, `alleys`, `airTunnels`, `undergroundTunnels`. |
| `hydrology` | none | `{ type: 'lagoon' \| 'river' \| 'sea-coast' }`. |

`streetDesign`, `pavingDesign`, `footprintShape`, `landmarkFloors` and `irregularity` are advanced; see CONTRACT.md.

## Response

A `CityBlueprint`: `meta`, `districts`, `streets` (node and edge graph), `architecture` (movement plan), `blocks`, `parcels`, `transit`, optional `hydrology`, `volumetric` and `stats`. Parcels carry type, wealth tier, lot, rectangular footprint, street access and height envelope. The movement plan carries each street's reserved widths, driving lanes and walking lanes, the legal turns at every node, crossings with their signal phases, and the ramps up to highway decks. Full shapes: CONTRACT.md and `schema/`.

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
