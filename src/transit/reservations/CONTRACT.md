# CONTRACT: subway entrance reservations

Purpose: reserves subway stair bays beside streets before building lots are cut.

## In / out

- `EntranceBays({edges, boundary, obstacles}).find(position, platform)` returns zero, one or two available entrance bays in deterministic distance order. Inputs and outputs: [schema.ts](schema.ts).
- `reserve(bays)` claims accepted bay land for subsequent stations. A search does not mutate reservations.
- `validateStationEntrances(state)` takes the `StationEntranceState` blueprint subset in [schema.ts](schema.ts) and checks bay ownership, full shaft dimensions, paving and the declared walking-band handoff. Incoherent output throws the root `E_INVARIANT` error.
- Each bay names its directed street side and distance along the edge. Its full land polygon includes a perimeter apron and a connection from the published walking band to the shaft entrance.

## Invariants

- Units are metres, polygons use the Atlas 1 mm coordinate grid.
- Ownership checks accept only boundary wedges that disappear when inset by half one coordinate-grid step. A finite-width overlap or missing paving region fails the reservation gate.
- Every shaft is 8 by 3 m and has a 1 m perimeter apron. Its width never depends on sidewalk width.
- Shafts stand outboard of the complete sidewalk. They do not occupy any roadway, walking band, other reservation, water or supplied obstacle.
- Bay paving connects to the actual side's walking band. Walking bands retain their complete width.
- Whole bays fit within the city boundary and avoid obstacles. No shape is clipped to make it fit.
- Each entrance is within the published station passage limit of its platform. A failed search returns no bays so the station planner can search another position or report `E_UNSATISFIABLE`.

## Errors

- `E_INVARIANT`: published reservations disagree with their street, shaft, paving or parcel ownership.
Planning inputs are validated Atlas graph and polygon data.

## Dependencies

- [Atlas](../../../CONTRACT.md): graph, station dimensions, geometry and error vocabulary.
- [Street construction](../../streets/construction/CONTRACT.md): directed sidewalk bands and exact corridor polygons.
- [Geometry](../../geom/CONTRACT.md): `hasInteriorBeyondPrecision` checks ownership boundaries without changing published coordinates.
