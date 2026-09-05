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
- `precisionInterior(polygons, boundaryWidth = GRID_STEP): Polygon[]` unions the complete region and erodes it by half `boundaryWidth`. Widths are finite positive metres. Its grid is 1,024 times finer than that width. Output is oriented nonzero-fill diagnostic contours (CCW outers, CW holes), with no final 1 mm snapping or area cutoff. These contours are query data, not constructed land.
- `hasInteriorBeyondPrecision(polygons, boundaryWidth = GRID_STEP)` returns whether `precisionInterior` is nonempty. An eroded region without a positive-area outer contour is empty.
- `coordinateCover(polygons, grid = GRID_STEP): Polygon[]` returns a diagnostic union of copied source polygons, outward edge strips at `grid / sqrt(2)` and bevel corner triangles. Inputs are finite simple unclosed rings in either winding, with no zero-length edges; `grid` is finite positive metres. Output rings are CCW and may overlap. No source union, snapping or area cutoff occurs; zero-area additions are omitted. Empty input returns `[]`. These masks supply complete-coverage queries, not constructed land.
- `coversSegment(polygon, a, b)` and `coversPath(polygon, path)` in [polygon.ts](polygon.ts) return whether every point of the segment or consecutive path segments lies inside or on the ring. Their [input types](schema.ts) are `Polygon`, `Vec2` and `Vec2[]`. Rings are simple, finite, have 3+ distinct vertices, and may use either winding. A zero-length segment or one-point path checks that point; an empty path returns false.

## Invariants

- Input coordinates are finite and within the integer clipping kernel's range. Boolean and offset coordinates use a 1 mm lattice.
- Crossing normalization routes all affected edges through shared grid-cell centres, then separates repeated vertices into simple rings. A centre is at most half a cell from its source segment on each axis. Features narrower than one cell can collapse. No whole polygon is buffered or inset for normalization.
- Exact vertex-on-edge contacts are noded at their existing integer coordinates and decomposed into simple cycles. Contact-only inputs preserve their signed area exactly; no neighbouring vertex is moved onto an edge.
- The same paths produce the same output. Normalizing an already normalized path set changes nothing. Reversing a shared segment preserves its routed boundary.
- Regions with holes are partitioned into hole-free rings. Rings below one square millimetre are omitted.
- Segment coverage checks every boundary crossing and the inward directions at touched vertices. Concave excursions fail even when both endpoints are covered. Boundary-collinear segments and inward tangencies are covered. These checks neither snap coordinates nor apply a distance tolerance; uncertain floating-point orientation signs use the exact represented coordinates.
- Grid-cell contact and crossing normalization share one half-open traversal predicate. Integer-ratio interval comparisons decide corner ownership without a radius or floating-point tolerance.
- Coordinate-cover additions use each original polygon's edges and vertices. Bevels join the two adjacent normal-offset points through their source vertex, including at concave corners. Exactly coincident shifted neighbors share one ring vertex; positive-area collapsed quads remain triangles. All input coordinates remain unchanged, and every returned coordinate array belongs to the caller. The complete subject must fit the mask union; missing regions receive no thickness allowance.

## Errors

`E_INVARIANT` if the normalized arrangement still contains a crossing, a diagnostic width/grid is not finite and positive, or a coordinate-cover ring is non-finite, degenerate or closed by a repeated endpoint.

## Depends on

- Root Atlas: coordinates and [polygon types](../../schema/blueprint.ts).
- Existing `clipper2-ts`: integer Boolean and offset operations.
