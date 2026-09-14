# Diagonal candidates

Proposes individual straight corridors between explicitly authored original rectangle faces.

`DiagonalCandidates.plan(input)` takes [DiagonalCandidateInput](schema.ts) and returns [DiagonalCandidate[]](schema.ts). Rectangles and allowed-region rings use metres in one fixed orthogonal planning frame. The caller identifies original rectangles and receiving street IDs; the planner does not recover them from cut polygons. A caller may transform the complete frame afterward.

For each face pair and each positive/negative 30 or 45 degree slope, the planner intersects the feasible line-offset intervals and considers their midpoint once. Angles default to both; corner clearance defaults to 3 m. Both edges of the full construction strip must meet each original face at least that clearance from both corners. `constructionWidth` includes every intended construction band and return extent, supplied by the caller. Mouths follow the receiving face, so their widths include the oblique projection. Street IDs identify caller-authored receiving streets, not validated street graph records.

The complete corridor must lie in the union of `allowedRegions`. Empty land, disconnected gaps and enclosed holes remain excluded. Exact binary coverage admits no gap tolerance. Rings are simple unclosed polygons; holes are represented by the surrounding allowed pieces. A failed midpoint yields no candidate; this finite proposal set is not an exhaustive search for offsets around obstacles. Coincident or crossing mouth boundaries produce no candidate.

Optional `through` faces identify every original face crossed between the terminals, in traversal order. Their complete mouths constrain the same offset interval and appear in `intermediateMouths`. Each strip edge must advance through them strictly between the terminals. The caller supplies these faces from the original layout.

Results follow face-pair order, angle order and positive then negative slope. Each candidate has one centerline, one complete footprint and mouth endpoints with measured corner clearances. Identical inputs return identical data. Inputs remain unchanged; output contains no graph edits, land subdivisions or model assets.

Malformed identities, rectangle bounds, regions, angles or dimensions throw `E_INVALID_PARAMS`. Valid inputs without feasible candidates return `[]`.

Dependencies: [Atlas coordinates/errors](../../../../CONTRACT.md), [exact coverage](../../../geom/partition/CONTRACT.md). Input and output schema: [schema.ts](schema.ts).
