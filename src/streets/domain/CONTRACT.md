# CONTRACT: street domain

Purpose: keeps complete selected street corridors inside city land before graph construction.

## In and out

`StreetDomain.reserve(input)` takes the city polygon, resolved street design and highway/alley toggles, [schema.ts](schema.ts). It returns the inset centerline boundary and its reserved clearance in metres.

`contains(point)`, `coversSegment(a, b)` and `covers(path)` test complete geometry against that boundary. Boundary points are included.

`validateStreetDomain(state)` takes the published city boundary and edges, [schema.ts](schema.ts), and checks every complete corridor against city land.

## Invariants

- Clearance covers the widest eligible roadway half-width plus the widest sidewalk, active highway half-width and active alley half-width. Two geometry-grid steps protect the independently snapped domain and corridor boundaries.
- The domain is reserved before tracing. Tracer steps and joins remain inside it; graph simplification and node clustering accept only complete paths inside it. Rejected geometric edits retain their valid source path or node.
- Published corridors keep their selected widths. Neither ground clipping nor an outside pavement extension can satisfy domain containment.
- An empty or disconnected inset fails with `E_UNSATISFIABLE`. No inset component is silently selected or discarded.
- Geometry checks are analytic, including concave boundary cuts. Identical inputs produce identical output.

## Errors

- `E_UNSATISFIABLE`: the configured corridor clearance leaves no connected street domain.
- `E_INVARIANT`: a published corridor extends beyond city land by more than the geometry grid's boundary precision.

Inputs are validated city polygons and resolved design settings.

## Dependencies

- [Street construction](../construction/CONTRACT.md): numeric profiles and shared highway/alley dimensions.
- [Geometry](../../geom/CONTRACT.md): offsets, grid precision and analytic segment coverage.
- [Atlas](../../../CONTRACT.md): boundary, graph construction and errors.
