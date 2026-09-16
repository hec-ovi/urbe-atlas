# Avenue medians

Builds physical ornamental islands within published central avenue reservations.

`AvenueMedians.build(plan, water?)` takes a [layout](../schema.ts) and returns [MedianConstruction](schema.ts): module definitions, owner placements, frontage supports, exact footprints and ornament anchors. `plan` remains unchanged. The caller subtracts the returned footprints from roadway cover and publishes the same modules and records.

Only grade four-lane edges with a 3.4 m central reservation are eligible. A median has 2 m paving, 0.2 m curbs and 0.5 m gutters on both sides. Rounded ends share their authored boundary points. Each island leaves room for the adjoining road, full sidewalk width, crossing and a 2 m margin at either end. Islands shorter than 8 m or touching supplied water polygons remain unselected. Tree and pole anchors occupy alternating 12 m stations inside paving, away from end caps.

The same plan gives identical output. Unsupported median widths or nonstraight frames fail with `E_INVALID_PARAMS`; median land outside its reserved road fails with `E_INVARIANT`. Schemas carry source edge IDs, dimensions, ground ownership and physical anchor positions. Material rendering and ornament models belong to consumers.

Depends on [layout](../CONTRACT.md), [modules](../../construction/modules/CONTRACT.md), and [geometry](../../../geom/CONTRACT.md).
