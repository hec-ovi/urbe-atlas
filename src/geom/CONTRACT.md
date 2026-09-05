# CONTRACT: geometry

Purpose: fixed-point polygon operations for the Atlas plan.

## In and out

Types: [schema.ts](schema.ts). Entry points: [clip.ts](clip.ts).

- `union(polygons)`, `difference(subject, clip)` and `intersection(subject, clip)` return the nonzero-fill region as simple CCW rings.
- `offset(polygons, delta, miterLimit = 2)` grows or shrinks closed regions in metres.
- `bufferLine(points, width)` returns the region around an open line, with round ends.
- `snap(value)` and `snapPoint(point)` return the nearest 1 mm coordinate.
- `normalizePaths(paths)` in [SnapRounding.ts](SnapRounding.ts) takes oriented integer-grid paths and returns crossing-free simple cycles on the same grid. It preserves winding for the Boolean wrapper's outer/hole classification.

## Invariants

- Input coordinates are finite and within the integer clipping kernel's range. Boolean and offset coordinates use a 1 mm lattice.
- Crossing normalization routes all affected edges through shared grid-cell centres, then separates repeated vertices into simple rings. A centre is at most half a cell from its source segment on each axis. Features narrower than one cell can collapse. No whole polygon is buffered or inset for normalization.
- The same paths produce the same output. Normalizing an already normalized path set changes nothing. Reversing a shared segment preserves its routed boundary.
- Regions with holes are partitioned into hole-free rings. Rings below one square millimetre are omitted.

## Errors

`E_INVARIANT` if the normalized arrangement still contains a crossing.

## Depends on

- Root Atlas: coordinates and [polygon types](../../schema/blueprint.ts).
- Existing `clipper2-ts`: integer Boolean and offset operations.
