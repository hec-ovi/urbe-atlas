# CONTRACT: source partition

Purpose: divides one ground owner without moving its source or reserved cell edges.

## In and out

Types: [schema.ts](schema.ts). Entries: [SourcePartition.ts](SourcePartition.ts), [verifyPartition.ts](verifyPartition.ts).

- `SourcePartition.create({id, source, coordinateScale?})` retains a finite simple source ring, in either winding. The optional `coordinateScale: 1000` declares every numeric input to this instance as an authored 1 mm lattice coordinate. Each input must equal its integer coordinate divided by 1000; off-grid values fail. Omitting the scale retains exact binary numeric input semantics, including derived coordinates.
- `divide(ownerId, {claims, remainderId})` gives ordered masks priority within that owner. All leftover land has the explicit remainder owner. Masks are unions of simple rings in either winding.
- `boundaries(ownerId)` returns simple hole-free numeric views. They can supply bounds and construction masks; they do not replace exact internal boundaries.
- `loops(ownerId)` returns signed boundary views (CCW exteriors, CW holes) for seam-free offset intents. No decomposition edges occur in this view.
- `components(ownerId)` separates connected components into stable opaque owner IDs with boundary views. Nested edits use those IDs and retain exact geometry. Empty owners return no components. Repeated calls return the same handles.
- `covers(ownerId, polygon)` checks complete containment, including holes and previous reservations. `reserve(ownerId, {id, polygon})` transfers a completely contained, unclosed CCW canonical polygon to a protected owner.
- `finish()` returns shared numeric vertices, simple owner pieces and a nonpublishing certificate. Fixed pieces retain their reserved polygon and corner order verbatim. `verifyPartition({source, partition, coordinateScale?})` uses the same declared source scale to check coverage, incidence and conversion before the caller discards the certificate.

## Invariants

- Source coordinates and canonical reserved corners are unchanged. Rational intersections share one identity and one numeric conversion. Derived solid vertices are not snapped to the source lattice.
- A declared lattice applies to source, masks, reservations and containment queries together. Mixing off-grid inputs into that instance fails; unmarked instances retain binary input semantics. Exact intersections are unrestricted in either mode. Saved-output IEEE-754 verification keeps its binary reader.
- All positive-area source land has exactly one owner; no owner adds land. Holes remain excluded. No area threshold discards a face, and no hole limit fills one.
- Each hole belongs to its immediate containing exterior, including islands that contain further holes.
- Hole triangulation candidates must conserve the exact oriented boundary. Touching holes join through existing contacts before adding bridges. Bridges enter the matching interior sector at repeated contact vertices; exact ear decisions handle unresolved candidates. Adjacent triangles coalesce only when their union has one simple boundary, retaining all boundary vertices.
- Every interior edge has opposite incidences; exterior chains equal the original source edges. Simple positive-winding pieces and the complete planar edge arrangement prove coverage and disjointness, not area equality alone.
- A certificate carries exact vertices and subdivision chains. Verification checks chains against source and piece edges, conversion against emitted numbers, planarity, winding and edge multiplicity. Corrupted faces, chains or vertices fail.
- Numeric output permits only the representation rounding of a shared rational vertex. Solid outlines publish every shared subdivision point. Protected polygons are published verbatim; subdivision points on their edges belong to the certificate, not their published outlines.
- One instance retains exact boundaries through nested divisions. Exported numeric views never become its geometry authority. Input source disjointness is a caller precondition for cross-source disjointness.
- Bounding-box indexes prune segment pairs and containment candidates. Deterministic input order gives deterministic output order. The existing fixed-point Boolean API is unchanged.
- Predicate filters use floating-point conversion/error bounds; uncertain signs use exact integers. The filter never admits a geometric distance tolerance.

## Errors

`E_INVARIANT`: invalid geometry, duplicate or unknown owner ID, invalid reservation, division of a protected owner, unresolved arrangement, or invalid certificate. Empty mask lists and empty owners are valid.

## Dependencies

- Root Atlas: `Polygon`, `Vec2`, and `E_INVARIANT`.
- Existing Three.js `ShapeUtils.triangulateShape`: candidate hole triangulations; exact boundary checks verify them.
