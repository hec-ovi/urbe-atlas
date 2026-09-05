# CONTRACT: grade-ground datum

Purpose: separates grade construction from projected infrastructure and physical clearance.

## In and out

Entry point: [index.ts](index.ts). Data: [schema.ts](schema.ts).

- `GradeDatum.plan(input)` takes a city boundary, planar street edges with assigned profiles, early Highway envelopes, roadway top and pedestrian top. It returns source-station spans, true grade roadway/pedestrian reservations, complete projected reservations, deck solids, land faces and roadway-facing frontage.
- `GradeDatum.physicalPlan({boundary, edges, structures})` returns only clipped deck geometry, source height profiles and structure edge identities. It builds no grade masks, land faces or frontage.
- `GradeDatum.clearanceFootprints(input)` takes either plan shape, later supports, ground top and caller-supplied clear height. It returns source-owned footprints whose solid geometry intersects that vertical range. Zero clear height queries contact at the ground datum.

## Ownership

- Positive-length flat source intervals at `roadwayTop` own grade construction. Street class never determines elevation. A ramp touching grade at one station creates no flat roadway area.
- Grade sidewalks retain their own directed widths. Junction roadway takes precedence over pedestrian reservations. Projections from other elevations cannot replace this ground.
- Per-source grade and projected entries are masks and may overlap across owners. The root's later shared partition assigns sole final ground ownership.
- All projected source corridors remain available for parcel reservations. Structure projections contain the complete deck width; the root applies its building clearance. Deck solids preserve source top and underside profiles.
- Station cuts use shared source distances, endpoints and tangents. Interior cuts share one snapped line and add no rounded cap. Original path joins and terminal caps remain bounded by the source corridor.
- Every spatial output is clipped to the city boundary. Sources and envelope fields are not mutated.

## Land and frontage

- Land contains the clipped city interior outside grade roadway. A bounded face of the grade centerline arrangement is `street-enclosed`; the bounded portion of the unbounded outer face is `outer-fringe`. The city boundary supplies no missing street edge to qualify a block.
- Face identity and kind precede Boolean hole partitioning. Pieces retain their source-face identity. Elevated centerlines and decomposition cuts cannot create a face, frontage, curb or separate block.
- Only `street-enclosed` faces enter the root's existing block eligibility policy. Fringe remains open apart from reserved street construction. These planar candidates still require the root's water, infrastructure and buildability exclusions.
- A street-enclosed face includes `enclosedArea`, its centerline area before roadway subtraction or city clipping, for the root's existing face-size eligibility limits.
- `roadFrontage` contains actual shared grade-road/land boundary segments with source span IDs. Both face kinds can have frontage. A clipping boundary or internal polygon cut alone creates none.
- Frontage source tags name contributing spans through the source/result grid neighborhoods. Exact queries declare these authored 1 mm inputs and retain positive sub-grid correspondence without changing ground polygons or requiring one source to cover an entire combined frontage segment.
- Frontage at an interior flat-to-ramp station is tagged `elevation-transition`; the root leaves that ramp handoff free of curbs. Ordinary `road-edge` frontage retains the root's curb eligibility rules.

## Physical clearance

- Deck clearance uses its source path, width and underside profile. Supports enter after placement against completed ground. Neither stage chooses a pedestrian height.
- The full and physical-only plans share one deck builder. Equal sources and clearance settings return equal clearance regions, including support ownership and clipping.
- Ground finish and physical clearance are independent: a clear elevated deck retains its building projection while ground continues beneath it. Real ramp/deck contact and support footprints remain physical obstacles.
- Profile crossings are interpolated in source arc-distance coordinates. Identical inputs produce identical output under the geometry box's precision rules.

## Errors

- `E_INVALID_PARAMS`: non-finite datum/clearance settings, pedestrian top below roadway top, or negative clearance.
- `E_INVARIANT`: incomplete profiles, inconsistent structure ownership, invalid source geometry or incoherent grade face/frontage ownership.

## Dependencies

- [Atlas](../../../../CONTRACT.md): planar graph, profiles, root ground levels and errors.
- [Street construction](../CONTRACT.md): exact corridor reservations.
- [Highway construction](../highway/CONTRACT.md): early envelopes and late support placement.
- [Geometry](../../../geom/CONTRACT.md): Boolean operations, shared precision and complete segment coverage.
- [Source partition](../../../geom/partition/CONTRACT.md): nonpublishing exact metadata overlap queries.
