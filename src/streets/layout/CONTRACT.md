# Street layout

Places a rectangular street grid directly from lane widths and whole sidewalk panel counts.

`GridLayout.plan(input)` takes [GridLayoutInput](schema.ts) and returns [GridLayoutPlan](schema.ts). Street profiles supply 1, 2 or 4 lanes. A caller selects each side's resolved sidewalk profile and finish from its district. Paved widths must be 2, 4 or 6 m with the module kit's 20 cm curb and 30 cm gutter.

`highway: true` reserves one four-lane interior through-run before block dimensions are calculated. The independent highway seed stream chooses its row or column within the middle half of the grid indices. At least one block remains on both sides, including in small cities. `highwayRunId` identifies the reserved grade run; the caller assigns its highway class and elevations. Omission or false publishes no highway reservation.

Row and column lengths vary independently, producing square and rectangular blocks. Each axis includes a shorter and a longer span while preserving its total panel count. Each row and column keeps one road profile. Blocks contain whole 2 m panel groups, fixed corner pieces and their buildable rectangles. Graph intersections are row/column identities. Roadway rectangles have disjoint interiors. Modules supply the road-facing corner returns. No line tracing or polygon intersection is needed to place the base grid.

The reserved rectangle remains inside the requested size. An optional perimeter profile constructs continuous outer sidewalks and supplies their directed edge sections. It requires whole-metre road spans. The caller owns the remaining land outside the roadway and sidewalk rectangle. Parking occurs on at most one wide frontage per selected block, with a 15% selection probability and complete clearances. Output includes explicit slot footprints. Guardrails occupy 2, 4 or 6 m groups on sparse seeded frontages, at most two groups per block. Parking and rail choices use independent seed streams. Same seed, settings and side selection produce identical data.

Optional `diagonals` defaults to true. Sparse interior blocks can carry one complete 30 or 45 degree street cut, with one or two lanes and fixed module junctions. Candidates have no parking bay, preserve reserved highway frontages and use local frontage roads. Their new junctions remain at least 40 m from the original street nodes; insufficient candidates leave the base grid intact. The target is one cut per 20 blocks, with at least one candidate considered. Cuts are nonadjacent and remain inside one block. Graph splits preserve source run stations and frontage references.

Invalid profiles or nonboolean feature flags throw `E_INVALID_PARAMS`; a size that cannot fit two blocks on each axis throws `E_UNSATISFIABLE`.

Dependencies: [construction](../construction/CONTRACT.md), [modules](../construction/modules/CONTRACT.md), [diagonal templates](../construction/modules/diagonal/CONTRACT.md), [Atlas](../../../CONTRACT.md).
