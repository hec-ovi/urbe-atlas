# CONTRACT: street construction

Purpose: assigns continuous street cross sections and reserves each side's space before parcels.

## In

- `resolveStreetDesign(input)`: optional numeric profile settings, [schema/design.ts](schema/design.ts).
- `StreetSections.plan(edges, nodes, design, districtAt)`: planar graph edges and nodes from the Atlas root contract, resolved profiles and a point-to-district-kind query.
- `StreetCorridors(edges)`: published street edges, including their cross sections.
- `StreetCorridors.roadwayFor(edge)` returns only that edge's canonical roadway polygons, byte-identical to its constructor map and reservation export. It computes no pedestrian bands; zero carriageway width returns `[]`.
- `StreetCorridors.sidewalk(edge, side)` and `.band(edge, side, role)`: a directed side and one band name from [schema/design.ts](schema/design.ts).
- `StreetCorridors.reservations(edges)` exports exact edge-local roadway, sidewalk and walking query polygons with their source model, [corridors/CONTRACT.md](corridors/CONTRACT.md). Final ground remains the junction ownership authority.
- `validateStreetSections({streets})`: published edge and construction records from [schema/sections.ts](schema/sections.ts); throws on inconsistent run ownership or dimensions.

## Out

- Resolved design settings: road profiles sorted by carriageway width and sidewalk profiles sorted by total width. Lane arrays run left to right across the directed path.
- `StreetSections.plan` returns edge cross sections and ordered through-runs, [schema/sections.ts](schema/sections.ts). A through-run pairs the straightest compatible arms at junctions and shares one road profile end to end. Its edges publish exact lane offsets, carriageway width and independent left/right sidewalk bands.
- `StreetCorridors` exposes `roadway` and `byEdge` maps of exact edge polygons, `full` flattened corridor polygons and `pedestrian` alley polygons. A block subtracts the complete corridors before subdivision; each side retains its own width.
- The static corridor queries return exact per-side or functional-band polygons, including bent path joins. These are edge-local reservations; a caller checks all intersecting roads before placing an object near a junction. An older edge without a cross section exposes its full sidewalk as walking space and empty other bands.
- A profile's optional `edge` supplies curb rise, gutter width and a road-facing lip's width/height. The existing `curb` is horizontal width. Selected sides publish `geometry.version = 1.0.0`, owned edge settings and normalized intervals from the carriageway edge; `top` is relative to roadway top. These are dimensions, not final ground polygons.

## Invariants

- Units are metres. Left/right refer to the directed edge path. Positive lane offset is left. Legacy side bands run from road to building: curb, border, furnishing, walking, frontage. Explicit geometry publishes gutter-lip and gutter intervals before those bands.
- New generation assigns 1 or 2 lanes to `street`, and exactly 4 lanes to `road` (avenue). Directions are explicit. A through-run preserves lane order, widths and travel direction when source edges reverse. Highway edges omit cross sections and keep the Atlas highway structure contract. Alleys have no lanes or curb and retain 3 to 5 m of pedestrian space.
- Default profiles are a 2-lane, 7 m street and a 4-lane, 14 m avenue. Sidewalk totals default to 3, 4.5, 6.5 and 8.5 m. These are game-design dimensions. The curb remains the shared 0.15 m construction width.
- A carriageway equals its lane widths plus shoulders. Legacy side width equals its band widths. Explicit side width equals `geometry.totalWidth`, including gutter and curb outside the paved span. The per-edge scalar fields repeat these totals.
- Identical graph and settings produce identical output. Width hierarchy is assigned to complete through-runs, independent of graph-edge fragmentation.
- Corridors reserve the full left and right pedestrian widths before parcel generation. Roadway ownership takes precedence where corridors meet at a junction.
- Optional `sidewalkAssignments` names a sidewalk profile per district and street class. Each side resolves its district independently; unspecified classes retain ranked selection. Walking width excludes all other bands. Building forecourts are not part of these reservations.
- `crossings.pedestrianClearance` resolves to 2.5 m when omitted. It is the positive vertical space requested from the grade datum's obstacle query, independent of crossing marking width.
- Saved blueprints retain their authored lane counts. `validateStreetSections` checks their dimensions and run continuity without applying new-generation profile eligibility. Loading a saved blueprint never changes it.
- Explicit side intervals run through gutter lip, gutter bed, curb, border, furnishing, walking and frontage. The lip is inside the gutter width, narrower than its gutter and no taller than the curb rise. Bed top is zero; curb and paved tops equal the curb rise. All dimensions are finite metres. Zero-width paved bands retain explicit empty intervals.
- Paved width excludes curb and gutter. Total side reservation adds both to the paved width; carriageway lanes retain their dimensions. Example authored settings are curb width/rise 0.20 m, gutter width 0.30 m, and road-facing lip width/height 0.02 m. A 2/4/6 m paved span then reserves 2.5/4.5/6.5 m per side. Existing production defaults remain unchanged.
- Omitted profile edge geometry retains legacy output shape and curb dimensions. Explicit profiles use the same run and district assignment implementation. Corridor production requires the supported format declared by its consumer contract.

## Errors

- `E_INVALID_PARAMS`: malformed profile settings, non-finite dimensions, duplicate ids or missing required road eligibility.
- `E_INVARIANT`: generated cross sections disagree with their published totals or run membership.

## Conformance

[One-way input](fixtures/one-way.input.json): use the supplied street profile alongside the default avenue and sidewalk profiles. Its two reversed source edges share one forward run; `a` publishes one forward lane and `b` one backward lane, each 3.5 m wide at offset 0.

## Dependencies

- [Atlas](../../../CONTRACT.md): graph, district kinds, geometry grid and error vocabulary.
