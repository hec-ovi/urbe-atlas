# CONTRACT: highway construction

Purpose: plans highway envelopes before placing their supports against completed ground.

## In and out

Entry point: [index.ts](index.ts). Data: [schema.ts](schema.ts).

- `highwayEnvelopes(edges)` returns one `HighwayEnvelope` per maximal highway run. Inputs contain edge ID, class, endpoint IDs and path, with optional width, level and assigned elevation profile. Graph-only inputs use the existing 15 m width and 8 m level. No nodes, boundary or ground obstacles are required.
- `supportHighwayEnvelopes(envelopes, gradeObstacles = [])` returns complete Atlas `HighwayStructure` records. Obstacles are reserved polygons. It adds supports without changing any envelope field.
- `highwayStructures(edges, gradeObstacles = [])` composes those two stages for existing callers.
- `applyHighwayElevationProfiles(edges)` assigns routing-edge profiles in place from the same envelope arithmetic. Each profile follows that edge's own direction and includes its interior ramp breakpoints.
- `highwayRuns(edges)` returns ordered maximal chains with endpoint ramp flags. `highwayElevationProfile(total, level, ramps)` returns canonical run knots; `levelAt(profile, distance)` linearly interpolates them and clamps outside the profile.

## Invariants

- Envelopes contain ordered edge IDs, continuous path, width, level, deck thickness, ramp lengths and elevation profile. They contain no support field. Removing supports from a completed structure reproduces its input envelope exactly.
- Runs end only at highway termini or forks. Closed rings have no ramps. Each highway edge belongs to one run; edges in a run agree on width and level.
- The shared construction dimensions remain 1 m deck thickness, 60 m terminal ramps, 30 m maximum support pitch, 2 m square supports and 1 m building clearance. A short run uses the same proportionally shortened ramps as the Atlas root contract.
- Supplied edge profiles span their complete paths and agree with the run's height function at their knots and every run breakpoint inside the edge. Reversing an edge preserves the physical height. Redundant edge-boundary knots do not add run breakpoints. No envelope or support operation changes input edges or profiles.
- Supports stand beneath the flat deck. Placement advances in path order, moving laterally or shortening the previous pitch when obstacles intervene. Supports are snapped to the 1 mm grid and do not intersect an obstacle.
- Identical inputs produce identical output. Support completion depends on the supplied envelope, including its deck thickness, rather than recomputing ramps or heights.

## Errors

`E_INVARIANT`: inconsistent run dimensions, incomplete or conflicting assigned profiles, disconnected run mapping, or unavailable support space. Errors name the source highway edge. An empty highway network returns an empty list.

## Dependencies

- [Atlas](../../../../CONTRACT.md): edge types, complete structure schema, ground level and errors.
- [Geometry](../../../geom/CONTRACT.md): snapped support footprints and obstacle intersections.
