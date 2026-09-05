# CONTRACT: street corridor reservations

Purpose: publishes the exact edge-local footprint queries used to plan street space.

## In and out

`StreetCorridors.reservations(edges)` and `StreetCorridors.model` are exported through [../StreetCorridors.ts](../StreetCorridors.ts).

Input: validated street edges, [../schema/sections.ts](../schema/sections.ts). Output: [schema.ts](schema.ts), [JSON schema](planning-reservations.schema.json).

Each source `edgeId` carries its roadway reservation and left/right complete sidewalk and walking reservations as simple CCW polygons in metres. Left/right follow the source edge's directed path. Zero-width regions are empty arrays. An edge without functional bands uses its full sidewalk as walking space.

## Authority

These are planning reservations before junction ownership. Final `GroundSurface` polygons, including their functional ownership when present, remain the sole rendered and collidable ground. Roadway takes precedence over pedestrian reservations where they meet. Elevated projections require the source edge's elevation profile; a roadway reservation does not declare grade ownership.

Consumers use the serialized query polygons for exact edge-local conformance and the actual final ground for junction containment. Source model fields explain construction; they do not make an independently reconstructed Boolean result authoritative.

## Source model

- A directed side sweeps segment rectangles from the centerline to radius `carriageway / 2 + side width`.
- Every bend adds a fan through the shortest signed angle in `[-pi, pi]`. Its `ceil(abs(angle) / maximumFanStepRadians)` stations divide the angle equally. Parallel radii share those stations.
- Each directed side has a quarter-fan at each endpoint. Coordinates snap to the model's 1 mm grid.
- A sidewalk or functional band is the union at its outer radius minus the union at its inner radius. Functional radii accumulate the published band order from the carriageway edge.
- Grade roadways union both one-sided sweeps. Highway roadway reservations use the geometry kernel's round open-line buffer. The serialized polygons include the kernel's exact normalization and hole decomposition.

## Invariants and errors

The export preserves every existing query polygon and input edge order. Identical inputs produce byte-identical JSON. Inputs are not changed. Returned polygon arrays are owned by the caller; shared model settings are deeply frozen. No additional errors are introduced; the geometry contract's `E_INVARIANT` applies.

## Conformance

- [Asymmetric bent input](fixtures/asymmetric-bend.input.json).
- [Exact reservations](fixtures/asymmetric-bend.expected.json).

The fixture includes unequal walking radii, two bends and both end caps. It is generated from the public queries and checked byte-for-byte.

## Dependencies

- [Street construction](../CONTRACT.md): widths, directed sides and functional bands.
- [Geometry](../../../geom/CONTRACT.md): fixed-point polygons and Boolean operations.
