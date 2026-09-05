# CONTRACT: geometry

Purpose: fixed-point polygon operations for the Atlas plan.

## In and out

Types: [schema.ts](schema.ts). Entry points: [clip.ts](clip.ts).

- `union(polygons)`, `difference(subject, clip)` and `intersection(subject, clip)` return the nonzero-fill region as simple CCW rings.
- `offset(polygons, delta, miterLimit = 2)` grows or shrinks closed regions in metres.
- `bufferLine(points, width)` returns the region around an open line, with round ends.
- `snap(value)` and `snapPoint(point)` return the nearest 1 mm coordinate.
- `segmentVisitsGridCell(a, b, center)` in [clip.ts](clip.ts) reports whether a segment touches the grid cell owned by `center`. Inputs are finite, snapped `Vec2` coordinates. Each cell includes its lower X/Z faces and excludes its upper faces, matching the half-toward-positive rounding rule. A point segment tests that point. The query does not move geometry.
- `normalizePaths(paths)` in [SnapRounding.ts](SnapRounding.ts) takes oriented integer-grid paths and returns crossing-free simple cycles on the same grid. It preserves winding for the Boolean wrapper's outer/hole classification.
- `hasInteriorBeyondPrecision(polygons, boundaryWidth = GRID_STEP)` unions the complete region and returns whether it retains interior after erosion by half `boundaryWidth`. Widths are finite positive metres. The check uses an internal grid 1,024 times finer than that width and publishes no geometry.
- `coversSegment(polygon, a, b)` and `coversPath(polygon, path)` in [polygon.ts](polygon.ts) return whether every point of the segment or consecutive path segments lies inside or on the ring. Their [input types](schema.ts) are `Polygon`, `Vec2` and `Vec2[]`. Rings are simple, finite, have 3+ distinct vertices, and may use either winding. A zero-length segment or one-point path checks that point; an empty path returns false.

## Invariants

- Input coordinates are finite and within the integer clipping kernel's range. Boolean and offset coordinates use a 1 mm lattice.
- Crossing normalization routes all affected edges through shared grid-cell centres, then separates repeated vertices into simple rings. A centre is at most half a cell from its source segment on each axis. Features narrower than one cell can collapse. No whole polygon is buffered or inset for normalization.
- Exact vertex-on-edge contacts are noded at their existing integer coordinates and decomposed into simple cycles. Contact-only inputs preserve their signed area exactly; no neighbouring vertex is moved onto an edge.
- The same paths produce the same output. Normalizing an already normalized path set changes nothing. Reversing a shared segment preserves its routed boundary.
- Regions with holes are partitioned into hole-free rings. Rings below one square millimetre are omitted.
- Segment coverage checks every boundary crossing and the inward directions at touched vertices. Concave excursions fail even when both endpoints are covered. Boundary-collinear segments and inward tangencies are covered. These checks neither snap coordinates nor apply a distance tolerance; uncertain floating-point orientation signs use the exact represented coordinates.
- Grid-cell contact and crossing normalization share one half-open traversal predicate. Integer-ratio interval comparisons decide corner ownership without a radius or floating-point tolerance.

## Errors

`E_INVARIANT` if the normalized arrangement still contains a crossing, or a diagnostic boundary width is not finite and positive.

## Depends on

- Root Atlas: coordinates and [polygon types](../../schema/blueprint.ts).
- Existing `clipper2-ts`: integer Boolean and offset operations.
