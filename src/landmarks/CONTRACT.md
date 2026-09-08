# CONTRACT: landmarks

Purpose: sets exact floor counts on selected commercial towers in an existing city.

## In / out

`applyLandmarkFloors(blueprint, floors): CityBlueprint`, exported by [index.ts](index.ts).

- Blueprint input/output: [CityBlueprint](../../schema/blueprint.ts). Input must satisfy the root Atlas contract.
- Floors: [LandmarkFloors](schema.ts), parcel IDs mapped to positive integer floor counts. Eligible parcels are `corpo`, `offices` or `hotel`, already hosting more than six floors. Each count must fit its district's `maxFloors`.
- The result sets each selected envelope's `minFloors` and `maxFloors` to the requested count. `maxHeight` and the planning prism height equal count times nominal floor height, rounded to centimetres.
- The source stays unchanged. The result shares unchanged collections and geometry with it. IDs, footprints, street access, transit and population statistics stay unchanged.
- `meta.params.landmarkFloors` combines existing selections with this request. Feeding the saved parameters to `generateCity` reproduces the authored city. Omitting this optional Atlas parameter preserves ordinary generation output; an empty map selects nothing.

## Errors

- `E_INVALID_PARAMS`: malformed floor map, unknown parcel, unsupported use or core, or district cap exceeded. Details identify `landmarkFloors` and the parcel where applicable.
- `E_INVARIANT`: a selected parcel has no district or planning prism in the input blueprint.

## Depends on

- [Atlas](../../CONTRACT.md), blueprint schemas, parameter resolution and errors.
- [Zoning](../zoning/CONTRACT.md), its guarantee that envelopes above six floors host an elevator core. Selected uses contribute no residential population.
