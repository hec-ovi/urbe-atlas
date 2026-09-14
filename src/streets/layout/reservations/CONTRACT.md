# Street construction reservations

Links authored frontage/corner supports to saved street ground and protected infrastructure. `StreetReservations.build(input)` and `.validate(reservations, city)` in [StreetReservations.ts](StreetReservations.ts) use [schema.ts](schema.ts). Inputs are validated Atlas layout/module and city records. Output is version 1.0.0; no renderer or material dependency.

Each roadway, sidewalk, curb and gutter ground index belongs to exactly one owner. Indices address the original `volumetric.ground` array and its declared count. Archive consumers retain that complete array/order with this record; reordering requires remapping and validation. Blocks retain their original building interiors and local parcel exclusions. Corner/frontage records are non-owning supports, and never create a second ground partition.

Frontage stations are metres from `start` toward `end`, with direction `[inward.z,-inward.x]`. `stationRange` starts at zero. `moduleStationOffset` locates the original module frame in this same coordinate. Parking and support intervals already use frontage stations. Native bays carry the exact published diagonal footprint, 6 by 2.5 m slots, 2 m ends and at least 2 m walking clearance. Road and paved levels come from the referenced ground; curb/gutter widths retain 0.2/0.3 m.

Underpass records reference their owner, junction, contributing edges and unchanged highway structures. Highway, station bay and shaft references add no ground. Nonmodule station paving belongs to one station owner; shaft openings and their interaction geometry remain the station consumer's responsibility. Consumers also honor the saved crossings, signal/planting positions and parcel access points before placing additional hardware. These original fields must remain in any blueprint projection supplied to Streets.

Identical inputs produce identical owned snapshots. Validation checks complete single ownership, source references, frontage frames and levels, local parcel exclusion, parking containment/dimensions and protected references. Malformed or inconsistent input uses Atlas `E_INVARIANT` with source evidence. This entry changes no graph, highway, source ground or input object.

Dependencies: [layout](../CONTRACT.md), [modules](../../construction/modules/CONTRACT.md), [Atlas](../../../../CONTRACT.md), [geometry](../../../geom/CONTRACT.md).
