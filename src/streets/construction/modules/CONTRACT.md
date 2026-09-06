# Street modules

Builds reusable sidewalk panels, curb groups, gutters, rounded corners and guardrails from whole metre dimensions.

## Input and output

`StreetModuleKit.block(input)` takes [BlockModuleInput](schema.ts) and returns [ModuleBlock](schema.ts). `construction()` returns the shared definitions and placements in [ModuleConstruction](schema.ts).

Block dimensions count whole 1 m panels. South, east, north and west sidewalk widths are 2, 4 or 6 m. Straight construction repeats a 2 m group: two panel stations, one curb and one gutter span. Corners use fixed 2 m radius pieces with panel seams on the same local grid. Only corner pieces have shaped terminals. All placements use quarter turns.

Each definition contains physical prisms with metre UV coordinates. Panel bodies leave 12 mm joints above a recessed bed. Corner joints preserve the shared inner and outer facets of the supporting beds. Paved height is 20 cm; curb width is 20 cm, gutter width 30 cm and its road-facing lip is 2 cm wide and high. Repeated placements share geometry. Guardrails stand in the outer panel row and leave the first and last 6 m of each straight run clear. Caller reservations suppress intersecting guardrail slots.

Block output supplies the buildable rectangle and complete outer bounds, including curb and gutter. Geometry construction is independent of material selection. Repeated calls with identical inputs produce identical data. Invalid panel counts, widths or dimensions throw `E_INVALID_PARAMS`.

## Dependencies

- [Atlas](../../../../CONTRACT.md): coordinates in metres and error vocabulary.
