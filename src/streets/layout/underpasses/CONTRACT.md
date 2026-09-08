# Highway underpasses

Constructs continuous grade sidewalks beneath the layout's elevated highway.

`HighwayUnderpasses.apply(plan, settings)` takes the [layout plan and settings](schema.ts), replaces paired corner placements with physical underpass modules, and returns block-owned planning regions for the replaced corners. The plan already carries highway classes and elevation profiles. Calling it without a highway leaves the plan unchanged.

Each interior highway intersection has two opposite grade arms. Each sidewalk joins its original end widths and lateral frontages. The narrower width continues beneath the highway. Ground roadway excludes the new module owners; the module supplies every physical prism and matching planning cover. Existing streets, building land, IDs and unused module placements retain their geometry.

The entire owner stays inside city land and outside water and low deck solids at the caller's pedestrian clearance. Later highway supports reserve the completed sidewalk. Saved frontages identify each underpass owner. Returned regions keep block sidewalk and curb queries aligned with physical paving.

Errors: `E_INVALID_PARAMS` for invalid clearance; `E_INVARIANT` for missing source corners or incompatible grade geometry; `E_UNSATISFIABLE` when city land or physical clearance cannot fit the underpass.

Dependencies: [layout](../CONTRACT.md), [underpass modules](../../construction/modules/underpass/CONTRACT.md), [module cover](../../construction/modules/CONTRACT.md), [highway datum](../../construction/datum/CONTRACT.md), [geometry](../../../geom/CONTRACT.md).
