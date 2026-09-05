# CONTRACT: source partition

Purpose: divides one ground owner without moving its source or reserved cell edges.

## In and out

Types: [schema.ts](schema.ts). Entries: [SourcePartition.ts](SourcePartition.ts), [verifyPartition.ts](verifyPartition.ts).

- `SourcePartition.create({id, source, coordinateScale?})` retains a finite simple source ring, in either winding. The optional `coordinateScale: 1000` declares its source and default input encoding as authored 1 mm lattice coordinates. Each authored input must equal its integer coordinate divided by 1000; off-grid values fail. Omitting the scale retains exact binary numeric input semantics, including derived coordinates.
- `divide(ownerId, {claims, remainderId})` gives ordered masks priority within that owner. All leftover land has the explicit remainder owner. A claim unions its existing `masks` with optional `edgeMasks`. Both describe simple rings in either winding. A claim's optional `encoding` applies to numeric masks and edge support endpoints.
- Each `edgeMasks` vertex is `{from, to, t}`: exact affine interpolation between two encoded support endpoints using the exact binary value of finite `t`. Any finite fraction is accepted, including extrapolation; the caller owns footprint containment. Fractions are never clamped. At 0 and 1, the support endpoint identity is retained.
- `edgeMaskView({mask, encoding?})` in [EdgeMasks.ts](EdgeMasks.ts) returns a numeric view in the supplied vertex order from the same exact edge construction. Its default endpoint encoding is binary. The view is not a substitute for passing `edgeMasks` when exact support incidence matters.
- `edgePositionView({position, encoding?})` in the same entry returns one constructed position using the identical encoding and conversion rules, without a polygon requirement.
- `boundaries(ownerId)` returns simple hole-free numeric views. They can supply bounds and construction masks; they do not replace exact internal boundaries.
- `boundaryEnclosures(ownerId)` returns the same simple-ring topology and vertex order, with `{lower: Vec2, upper: Vec2}` per exact vertex. Each coordinate pair is its tight representable floor and ceiling, equal for an exactly representable coordinate. These returned copies enclose retained rational coordinates, not the multi-round numeric views; they change no source, publication or certificate.
- `loops(ownerId)` returns signed boundary views (CCW exteriors, CW holes) for seam-free offset intents. No decomposition edges occur in this view.
- `components(ownerId)` separates connected components into stable opaque owner IDs with boundary views. Nested edits use those IDs and retain exact geometry. Empty owners return no components. Repeated calls return the same handles.
- `covers(ownerId, polygon, {encoding?}?)` checks complete containment, including holes and previous reservations. `reserve(ownerId, {id, polygon, encoding?})` transfers a completely contained, unclosed CCW canonical polygon to a protected owner.
- `finish()` returns shared numeric vertices, simple owner pieces and a nonpublishing certificate. Fixed pieces retain their reserved polygon and corner order verbatim. `verifyPartition({source, partition, coordinateScale?})` uses the same declared source scale to check coverage, incidence and conversion before the caller discards the certificate.

## Invariants

- Source coordinates and canonical reserved corners are unchanged. Rational intersections share one identity and one numeric conversion. Derived solid vertices are not snapped to the source lattice.
- Omitted operation encodings inherit the instance default. Explicit `authored-1mm` uses exact integer/1000 input; explicit `binary` uses the supplied Float64 values exactly. Operations share one exact point pool and never reinterpret the original source. Exact intersections are unrestricted in either mode. Saved-output IEEE-754 verification keeps its binary reader.
- Encodings are never inferred from values. A binary polygon retains the supplied coordinates; it does not recover earlier exact edge incidences lost during publication. Such incidences require retained exact ownership, not numeric re-import.
- Edge masks retain their declared support-line incidences through exact interpolation and overlay. Shared station sides use the same fraction supplied by the caller. Source construction and its numeric view use one coordinate conversion rule.
- Numeric conversion divides finite integer representations directly. If an intermediate integer overflows, exact quotient rounding uses nearest-even Float64 spacing, including subnormal positions.
- All positive-area source land has exactly one owner; no owner adds land. Holes remain excluded. No area threshold discards a face, and no hole limit fills one.
- Each hole belongs to its immediate containing exterior, including islands that contain further holes.
- Hole triangulation candidates must conserve the exact oriented boundary. Touching holes join through existing contacts before adding bridges. Bridges enter the matching interior sector at repeated contact vertices; exact ear decisions handle unresolved candidates.
- Decomposition includes every semantic boundary junction before coalescing. Numerically inverted or crossed intermediate faces merge across same-owner seams first. Adjacent faces coalesce only when their exact union has one simple boundary; source, semantic and protected cell boundaries remain fixed.
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
