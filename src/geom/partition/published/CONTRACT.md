# CONTRACT: published ground cover

Purpose: verifies saved ground polygons against an independent land boundary.

## In and out

`verifyPublishedCover(input): void`, [verifyPublishedCover.ts](verifyPublishedCover.ts), takes [PublishedCoverInput](schema.ts): one simple boundary, simple exclusion polygons and uniquely identified simple pieces. Rings may use either winding. The land domain is the boundary minus the union of exclusions. Empty pieces are valid only for an empty domain. Inputs are unchanged.

## Invariants

- Positive pieces cover the domain exactly once, with opposite shared-edge incidences and the complete independent outer and hole boundaries. No original owner geometry, hash or generation certificate is needed.
- Published shared vertices have identical numeric coordinates. Vertices are never merged. Nonfixed outlines must contain all shared subdivision points. Fixed outlines may retain original straight edges and corners.
- Verification can place an omitted subdivision point on its containing fixed edge only within four adjacent IEEE-754 values per coordinate. This bounds the existing rational numerator conversion, denominator conversion and division. The containing edge's endpoints stay fixed; competing constraints must agree. This is a verification witness, and does not change saved polygons.
- Exact noding and incidence checks use that one consistent witness per vertex. Millimeter tolerances, area-only checks and independent per-face snapping are absent.
- Geometry alone cannot detect coherent internal-seam movement that still forms a valid cover, or distinguish an edit within conversion uncertainty from an unknown rational conversion. Collapsed numeric vertices and conflicting conversion constraints fail.

## Errors

`E_INVARIANT`: malformed rings or IDs, conflicting conversion witnesses, missing or duplicate land, overlapping pieces or land outside the domain.

## Dependencies

- Parent partition kernel: `Exact.ts` rational points and predicates, `Segments.ts` exact noding, `Arrangement.ts` exclusion union, `RingInput.ts` simple-ring validation and `BoxIndex.ts` conservative pruning. These remain private dependencies of this validator.
- Atlas coordinates and `E_INVARIANT`.
