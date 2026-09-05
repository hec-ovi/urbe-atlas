# CONTRACT: grade-ground datum

Purpose: separates grade construction from projected infrastructure and physical clearance.

## In and out

Entry point: [index.ts](index.ts). Data: [schema.ts](schema.ts).

- `GradeDatum.plan(input)` takes a city boundary, planar street edges with assigned profiles, early Highway envelopes, roadway top and pedestrian top. It returns source-station spans, true grade roadway/pedestrian reservations, inclusive grade corridors, complete projected reservations, deck solids, land faces and roadway-facing frontage.
- Omitted `groundFormat` accepts curb-only sidewalk sections. Explicit `sidewalks.*.geometry` fails before source construction, with its edge, directed side and version. `groundFormat: 'side-bands-v1'` opts into explicit role output through the same planner and is echoed in the result. Unknown formats fail.
- The opted-in plan adds `grade.sideBands`: source edge, directed side, interval role, ordered contributing `spanIds`, absolute `top`, and complete query `masks`. Rows follow edge, left/right and normalized interval order, including empty roles. Curb-only sides retain their existing pedestrian rows and caller pedestrian top.
- `GradeDatum.roadwayPlan({boundary, edges, roadwayTop})` returns all source spans and only their flat-at-datum roadway owners. It builds no pedestrian corridors, structures, land faces or frontage.
- `GradeDatum.physicalPlan({boundary, edges, structures})` returns only clipped deck geometry, source height profiles and structure edge identities. It builds no grade masks, land faces or frontage.
- Roadway-only and physical-only queries accept explicit side geometry; their outputs depend on carriageways and decks, not pedestrian interval heights or roles.
- `GradeDatum.clearanceFootprints(input)` takes either plan shape, later supports, ground top and caller-supplied clear height. It returns source-owned footprints whose solid geometry intersects that vertical range. Zero clear height queries contact at the ground datum.

## Ownership

- Positive-length flat source intervals at `roadwayTop` own grade construction. Street class never determines elevation. A ramp touching grade at one station creates no flat roadway area.
- Full and roadway-only plans share source validation and station cuts. Equal sources return byte-identical spans and roadway rows, including separate flat intervals on a mixed-height edge. All spans retain source identity and elevation classification. Zero-width, off-grade or wholly city-clipped spans have no roadway owner row.
- Grade sidewalks retain their own directed widths. Junction roadway takes precedence over pedestrian reservations. Projections from other elevations cannot replace this ground.
- Per-source grade and projected entries are masks and may overlap across owners. The root's later shared partition assigns sole final ground ownership.
- Explicit side geometry requires complete positive source-span coverage, all flat at `roadwayTop`. Redundant flat profile knots retain their span IDs in one full role row. Mixed-height, ramp and off-grade explicit sides fail; no role mask is duplicated or station-cut to imply their support.
- Each explicit side's complete queried envelope must fit the city domain before publication. Exact containment checks the entire polygons, including concave boundary excursions. Failure names the source edge, directed side and offending full mask. Valid role masks are byte-identical to the corridor queries, without clipping, re-importing derived geometry or roadway subtraction. Absolute role tops equal roadway top plus the published interval top.
- Explicit sides publish only side-band rows, not inclusive pedestrian rows. `grade.full` and `grade.corridors` retain complete reservation land for parcels. They do not classify modern gutter, curb or walking ownership.
- Side-band masks do not resolve junction returns or conflicts between source heights. They remain overlapping source claims until a consuming ground planner supplies shared junction construction and sole physical owners.
- `grade.corridors` preserves each flat span's original inclusive `byEdge` corridor under its station and city cuts, before roadway or pedestrian differences. It includes the carriageway and both complete directed sides. No aggregate union changes these masks; the final partition claims them after roadway and curb ownership.
- All projected source corridors remain available for parcel reservations. Structure projections contain the complete deck width; the root applies its building clearance. Deck solids preserve source top and underside profiles.
- Station cuts use shared source distances, endpoints and tangents. Interior cuts share one snapped line and add no rounded cap. Original path joins and terminal caps remain bounded by the source corridor.
- Reservation, land and physical-footprint polygons stay inside the city boundary. Complete explicit side claims pass containment unchanged; other polygon outputs use the shared station and city cuts. Source paths, spans and envelope fields retain their authored extent and are not mutated.

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

- `E_INVALID_PARAMS`: unknown ground format, non-finite datum/clearance settings, pedestrian top below roadway top, or negative clearance.
- `E_INVARIANT`: unsupported full-plan side geometry/elevation, explicit side envelope outside the city, incomplete profiles, inconsistent structure ownership, invalid source geometry or incoherent grade face/frontage ownership.

## Dependencies

- [Atlas](../../../../CONTRACT.md): planar graph, profiles, root ground levels and errors.
- [Street construction](../CONTRACT.md): exact corridor reservations.
- [Highway construction](../highway/CONTRACT.md): early envelopes and late support placement.
- [Geometry](../../../geom/CONTRACT.md): Boolean operations, shared precision and complete segment coverage.
- [Source partition](../../../geom/partition/CONTRACT.md): nonpublishing exact containment and metadata overlap queries.
