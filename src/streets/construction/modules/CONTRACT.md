# Street modules

Builds shared sidewalk, curb, gutter, corner, parking and guardrail prisms with quarter-turn placements.

## Input and output

- `new StreetModuleKit(format?)` takes [ModuleFormat](schema.ts), default `source`.
- `block(input)` takes [BlockModuleInput](schema.ts), returns [ModuleBlock](schema.ts).
- `perimeter(input)` takes [PerimeterModuleInput](schema.ts), returns [ModuleFrontage](schema.ts).
- `construction()` returns owned copies of definitions, placements, parking and perimeter owners, [ModuleConstruction](schema.ts).
- `ModuleGround.cover(construction)` returns [ModuleGroundRegion](schema.ts) planning outlines by owner, surface and level. Physical prisms own rendering and collision. Supporting beds join once per template; straight runs retain rectangular covers. `partitionedBeds` preserves already disjoint bed outlines.

External frontage owners may declare `kind: 'median'` for a separately reserved avenue island. Its producer owns the dimensioned definition and frontage supports; the kit does not infer islands from road width.

## Formats and dimensions

| Measurement | Source | District |
| --- | --- | --- |
| Panel band | 2, 4 or 6 m | 4 m on every side |
| Inner separator | None | 0.2 m |
| Curb width and height | 0.2 m | 0.2 m |
| Gutter width | 0.3 m | 0.5 m |
| Native parking slot | 6 x 2.5 m | 6 x 2 m |
| Native parking walking width | 3.5 m | 2.2 m, including separator |

Block `panels` are even integer counts including corner reservations. District physical paved dimensions equal these counts plus 0.4 m per axis. Each district straight side is 4.2 m wide; the buildable rectangle remains `panels - 8 m` on both axes. Curb and gutter add 0.7 m outside each district paved edge. Straight spans retain complete 2 m repeats.

Source straight groups use 1 m panels; `centerDouble` adds a 2 x 2 m middle panel on 4/6 m sides. District groups always use four 1 m panels next to the curb, one 2 x 2 m inner panel, then the separator. Paved corner radius is 2 m in source format and 4.2 m in district format. District corners share the inner block corner as their center, preserving the two panel bands through the turn. Panel bodies leave 12 mm joints above a recessed bed. Paving is 0.2 m high; gutter lips are 0.02 m wide and high. UV coordinates are local metres. Definitions contain complete physical prisms; material selection belongs to consumers.

`construction().format` is `district` for district construction; omission identifies source construction. District frontage plans publish paved, curb and gutter widths. Every block plan includes directed road-facing tangents, inward vectors, original module station endpoints and corner support with placement identity. Parking stations increase from `moduleStationOrigin` toward `moduleStationEnd`. Planning support adds no ground ownership.

## Parking and guardrails

Native parking requires a 6 m source or 4 m district panel band. Each bay has 1 to 3 slots in a rectangular notch and 2 m support aprons beyond both ends. Starts are even stations, at least 8 m from the straight-run origin. Complete support stays 6 m clear of corners, caller reservations and other bays. Records publish frontage identity, slot footprints, bay footprint, support interval and walking clearance. Curbs and gutters use shared authored 1 mm offset vertices; road geometry and planning use the same footprint. Streets owns native panel fitting; modules retain complete compatibility paving.

Source parking without `profile` uses 4 x 2 m slots on 4/6 m sides with 2 m rectangular returns and at least 2 m walking width. Starts are even stations, at least 6 m from either corner reservation. District parking requires `profile: 'native'`.

Guardrail groups contain 1 to 3 repeated 2 m rails, occupy the outer panel row and stay 6 m clear of either straight-run end. Parking support and caller reservations suppress intersecting groups. Callers select parking and guardrail frequency.

## Perimeter and validity

Perimeters enclose a roadway rectangle. Source spans are whole metres. District spans use 0.2 m increments with endpoint coordinates on the 1 mm grid. Spans are at least 4 m. Two-metre groups end with a fitted terminal group when needed; outer corners use fitted panels and formed curb caps. Placements reference the frontage owner through `blockId`.

Optional `exclusions` are land the ring may not stand on (water). Every 2 m group, terminal group and corner that meets them is left unplaced, so the ring stops at the shoreline instead of crossing it and never clips a module. A side cut this way publishes one frontage plan per remaining stretch, numbered `frontage:<owner>:<side>:<index>`; an uncut side keeps the single `frontage:<owner>:<side>`. A corner stands only on clear land between two placed neighbours, and a frontage end with no corner publishes `null`. Omitted or empty exclusions reproduce the original ring exactly.

Identical input produces identical output. Unsupported format, dimensions, reservations, duplicate owner IDs or parking throw `E_INVALID_PARAMS` before geometry is published. Sub-grid district perimeter input is rejected.

## Dependencies

- [Atlas](../../../../CONTRACT.md): metre coordinates, polygon schemas and errors.
- [Geometry](../../../geom/CONTRACT.md): joins and fits template covers on the authored millimetre grid.
