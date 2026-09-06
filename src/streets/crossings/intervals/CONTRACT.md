# CONTRACT: crossing station intervals

Purpose: derives full-band crossing intervals and shared source-edge subdivisions.

## In and out

`CrossingIntervals.find(input)` in [CrossingIntervals.ts](CrossingIntervals.ts) takes [StationIntervalQuery](schema.ts) and returns [StationInterval](schema.ts) records. Its mask fields accept raw polygon arrays or prepared `FootprintRegions` fields; [StationIntervalInput](schema.ts) is the raw-array form.

`FootprintRegions.outside(source, masks)` and `.inside(source, masks)` in [FootprintRegions.ts](FootprintRegions.ts) take a `Polygon` and a readonly `Polygon[]`, [types](schema.ts). They return simple polygon views of the source outside or inside the mask union. These views retain source boundaries and shared intersections without another coordinate snap.

`FootprintRegions.outsideEnclosures(source, masks)` and `.insideEnclosures(source, masks)` take the same inputs and return tight representable coordinate bounds for each exact missing or intersection vertex, [PartitionPointEnclosure](../../../geom/partition/schema.ts). Projection consumes these enclosures without a rational-to-numeric view approximation.

`FootprintRegions.covers(source, allowed)` takes a `Polygon` and readonly `Polygon[]`, [types](schema.ts). It returns whether the complete source fits `coordinateCover(allowed)` at its default precision. Empty allowed land returns false. This exact query retains uncovered ownership; no views rebuild geometry or acceptance survives a call.

`new FootprintRegions(masks)` snapshots and validates a readonly `Polygon[]`. Its `covers(source)`, `inside(source)`, `outside(source)` and enclosure methods perform those same queries against the snapshot. `missing(source)` returns coordinate-cover omissions as exact vertex enclosures. The instance retains prepared masks and lazily prepared coordinate-cover masks; each query owns its partition and results. Changing caller inputs or returned results cannot change the field. `empty` reports an empty mask list.

`new StationFrame(a, b)` in [StationFrame.ts](StationFrame.ts) takes finite `Vec2` endpoints with positive segment length. It exposes metric `length`, unit forward `u`, unit left `v`, canonical `point(station, lateral)` and metric `project(point)`. `edgePoint(station, lateral)` canonicalizes both source endpoints at that lateral offset once, then uses the source partition's authored-1 mm `edgePositionView` for interior fractions. Endpoints retain their cached coordinates. Crossing fields, stripes and landing cuts use this same subdivision.

- `a`, `b` define a directed straight segment. `width` is the footprint length along that segment; `lateral: [min, max]` measures offsets along its left normal. Dimensions are metres.
- Optional `sourceOffset` is finite nonnegative preceding path distance, default 0. Callers publish `distance = sourceOffset + station` and recover the local station by subtracting the same offset. Interval bounds include the rounding of both operations and the source-edge fraction division.
- `allowed` is the union of finite simple polygon rings. Optional `forbidden` blocks overlap with a positive precision interior. Optional `excluded` blocks every positive-area overlap with its union, including sub-grid regions. Both default to empty. Empty unions are valid. Rings use the Atlas coordinate range.
- Output intervals are safe inclusive centre stations from `a`, sorted and disjoint. They conservatively bound valid placements and need not be maximal. The complete footprint stays between the segment endpoints. A point interval permits an exact fit; no fit returns `[]`. Callers verify each complete derived footprint against final ownership.

## Invariants

- The physical source band has canonical 1 mm corners. The diagnostic `numericSweepEnvelope` encloses every derived numeric footprint using source-side coordinate error boxes; its polygon is unsnapped and changes no physical geometry. Allowed land uses `coordinateCover`. Every exact piece outside that cover blocks its full station projection. Excluded masks block their exact intersection with the diagnostic sweep. Forbidden masks separately block the `precisionInterior` of their intersection.
- Coverage validates original geometry before proving the retained uncovered owner empty or refining it with the default coordinate cover. Prepared source-boundary indexes select only exact edges overlapping the queried owner. Numeric views never rebuild that owner. Prepared fields retain geometry within their caller's scope and never retain query partitions or acceptance results.
- Obstruction projections use tight rational vertex enclosures and both sweep source-side error boxes. They retain outward fraction bounds, expanded by half the footprint width. Boundary contact is permitted.
- Scalar arithmetic uses tight directed Float64 bounds. Exact binary-fraction comparisons retain exact operations; monotone inverse bounds include fraction division, half-width addition and source-offset encoding.
- Coordinate exception: source long-band corners use the 1 mm grid; derived field, stripe and landing points retain their shared-edge interpolation coordinates without another snap. Nominal widths and station distances are unchanged. Only floating-point interpolation representation remains.
- Geometry predicates use their unmodified defaults. No larger tolerance, sampled station search, footprint narrowing or partial polygon fit is used. Callers verify complete derived footprints with the same coverage and intrusion predicates.
- Allowed-source bounding boxes include the published 1 mm maximum coordinate displacement; envelope, excluded and forbidden masks use exact bounding-box overlap. Numeric endpoint ordering and interval subtraction are deterministic. Inputs are unchanged; identical inputs return identical intervals.

## Errors

- `E_INVALID_PARAMS`: malformed or non-finite coordinates, malformed rings, a zero-length segment, a non-positive or unrepresentable half-width, an invalid source offset or an unordered lateral band.
- `E_INVARIANT`: a region query receives invalid geometry or its dependency cannot resolve a valid arrangement.

## Dependencies

- [Atlas](../../../../CONTRACT.md): coordinates and error vocabulary.
- [Geometry](../../../geom/CONTRACT.md): canonical 1 mm corners, `numericSweepEnvelope`, `coordinateCover`, `precisionInterior` and `hasInteriorBeyondPrecision`.
- [Source partition](../../../geom/partition/CONTRACT.md): exact source-preserving regions, tight vertex enclosures and shared-edge numeric views.
- [Street construction](../../construction/CONTRACT.md): directed lateral bands.
