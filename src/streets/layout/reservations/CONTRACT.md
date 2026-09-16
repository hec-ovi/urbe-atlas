# Street construction reservations

Links authored frontage/corner supports to saved street ground and protected infrastructure. `StreetReservations.build(input)` and `.validate(reservations, city)` in [StreetReservations.ts](StreetReservations.ts) use [schema.ts](schema.ts). Inputs are validated Atlas layout/module and city records. Output is version 1.0.0; no renderer or material dependency.

Each roadway, sidewalk, curb and gutter ground index belongs to exactly one owner. Indices address the original `volumetric.ground` array and its declared count. Archive consumers retain that complete array/order with this record; reordering requires remapping and validation. Blocks retain their original building interiors and local parcel exclusions. Corner/frontage records are non-owning supports, and never create a second ground partition.

District avenue islands retain explicit `median` owners from module frontage records. Their paved width is 2 m, with 0.2 m curbs and 0.5 m gutters; they contain no building interiors or parcel exclusions.

Frontage stations are metres from `start` toward `end`, with direction `[inward.z,-inward.x]`. `stationRange` starts at zero. `moduleStationOffset` locates the original module frame in this same coordinate. Parking and support intervals already use frontage stations. Road and paved levels come from the referenced ground. Explicit frontage curb/gutter widths are retained; omitted values use 0.2/0.3 m source defaults.

`city.modules.format` selects the dimension contract. Source construction, including omitted format, permits 2/4/6 m paved widths with 0.2 m curbs and 0.3 m gutters. District construction requires 4.2 m paved widths, 0.2 m curbs and 0.5 m gutters. Native parking has 6 m slots, 2 m diagonal ends and exact published footprints: source bays are 2.5 m deep on 6 m paved frontages with 3.5 m walking clearance; district bays are 2 m deep with 2.2 m walking clearance. Slot area is measured in local coordinates with a one-square-millimetre numeric tolerance; containment uses the authored geometry grid.

Underpass records reference their owner, junction, contributing edges and unchanged highway structures. Highway, station bay and shaft references add no ground. Nonmodule station paving belongs to one station owner; shaft openings and their interaction geometry remain the station consumer's responsibility. Consumers also honor the saved crossings, signal/planting positions and parcel access points before placing additional hardware. These original fields must remain in any blueprint projection supplied to Streets.

Identical inputs produce identical owned snapshots. Validation checks complete single ownership, source references, frontage frames and levels, local parcel exclusion, parking containment/dimensions and protected references. Malformed or inconsistent input uses Atlas `E_INVARIANT` with source evidence. This entry changes no graph, highway, source ground or input object.

Dependencies: [layout](../CONTRACT.md), [modules](../../construction/modules/CONTRACT.md), [Atlas](../../../../CONTRACT.md), [geometry](../../../geom/CONTRACT.md).
