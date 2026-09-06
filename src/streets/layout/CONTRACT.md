# Street layout

Places a rectangular street grid directly from lane widths and whole sidewalk panel counts.

`GridLayout.plan(input)` takes [GridLayoutInput](schema.ts) and returns [GridLayoutPlan](schema.ts). Street profiles supply 1, 2 or 4 lanes. A caller selects each side's resolved sidewalk profile and finish from its district. Paved widths must be 2, 4 or 6 m with the module kit's 20 cm curb and 30 cm gutter.

Each row and column keeps one road profile. Blocks contain whole 2 m panel groups, fixed corner pieces and their buildable rectangles. Graph intersections are row/column identities. Roadway rectangles have disjoint interiors. Modules supply the road-facing corner returns. No line tracing or polygon intersection is needed to place this grid.

The reserved rectangle remains inside the requested size. An optional perimeter profile constructs continuous outer sidewalks and supplies their directed edge sections. It requires whole-metre road spans. The caller owns the remaining land outside the roadway and sidewalk rectangle. Parking occurs on at most one wide frontage per selected block, with a 15% selection probability and complete clearances. Output includes explicit slot footprints. Guardrails occupy 2, 4 or 6 m groups on sparse seeded frontages, at most two groups per block. Parking and rail choices use independent seed streams. Same seed, settings and side selection produce identical data.

Invalid profiles throw `E_INVALID_PARAMS`; a size that cannot fit two blocks on each axis throws `E_UNSATISFIABLE`.

Dependencies: [construction](../construction/CONTRACT.md), [modules](../construction/modules/CONTRACT.md), [Atlas](../../../CONTRACT.md).
