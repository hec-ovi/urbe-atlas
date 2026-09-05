# CONTRACT: street construction

Purpose: assigns continuous street cross sections and reserves each side's space before parcels.

## In

- `resolveStreetDesign(input)`: optional numeric profile settings, [schema/design.ts](schema/design.ts).
- `StreetSections.plan(edges, nodes, design, districtAt)`: planar graph edges and nodes from the Atlas root contract, resolved profiles and a point-to-district-kind query.
- `StreetCorridors(edges)`: published street edges, including their cross sections.
- `StreetCorridors.sidewalk(edge, side)` and `.band(edge, side, role)`: a directed side and one band name from [schema/design.ts](schema/design.ts).
- `StreetCorridors.reservations(edges)` exports exact edge-local roadway, sidewalk and walking query polygons with their source model, [corridors/CONTRACT.md](corridors/CONTRACT.md). Final ground remains the junction ownership authority.
- `validateStreetSections({streets})`: published edge and construction records from [schema/sections.ts](schema/sections.ts); throws on inconsistent run ownership or dimensions.

## Out

- Resolved design settings: road profiles sorted by carriageway width and sidewalk profiles sorted by total width. Lane arrays run left to right across the directed path.
- `StreetSections.plan` returns edge cross sections and ordered through-runs, [schema/sections.ts](schema/sections.ts). A through-run pairs the straightest compatible arms at junctions and shares one road profile end to end. Its edges publish exact lane offsets, carriageway width and independent left/right sidewalk bands.
- `StreetCorridors` exposes `roadway` and `byEdge` maps of exact edge polygons, `full` flattened corridor polygons and `pedestrian` alley polygons. A block subtracts the complete corridors before subdivision; each side retains its own width.
- The static corridor queries return exact per-side or functional-band polygons, including bent path joins. These are edge-local reservations; a caller checks all intersecting roads before placing an object near a junction. An older edge without a cross section exposes its full sidewalk as walking space and empty other bands.

## Invariants

- Units are metres. Left/right refer to the directed edge path. Positive lane offset is left. Sidewalk bands run from road to building: curb, border, furnishing, walking, frontage.
- Road profiles carry one or more lanes with explicit directions. A through-run preserves lane order, widths and travel direction when source edges reverse. Highway edges omit cross sections and keep the Atlas highway structure contract. Alleys have no lanes or curb and retain 3 to 5 m of pedestrian space.
- Ground road widths default to 7, 14 and 21 m. Sidewalk totals default to 3, 4.5, 6.5 and 8.5 m. These are game-design dimensions. The curb remains the shared 0.15 m construction width.
- A carriageway equals its lane widths plus shoulders. Each sidewalk equals its band's widths. The per-edge scalar fields repeat these exact totals.
- Identical graph and settings produce identical output. Width hierarchy is assigned to complete through-runs, independent of graph-edge fragmentation.
- Corridors reserve the full left and right pedestrian widths before parcel generation. Roadway ownership takes precedence where corridors meet at a junction.
- Optional `sidewalkAssignments` names a sidewalk profile per district and street class. Each side resolves its district independently; unspecified classes retain ranked selection. Walking width excludes all other bands. Building forecourts are not part of these reservations.
- `crossings.pedestrianClearance` resolves to 2.5 m when omitted. It is the positive vertical space requested from the grade datum's obstacle query, independent of crossing marking width.

## Errors

- `E_INVALID_PARAMS`: malformed profile settings, non-finite dimensions, duplicate ids or missing required road eligibility.
- `E_INVARIANT`: generated cross sections disagree with their published totals or run membership.

## Conformance

[One-way input](fixtures/one-way.input.json): apply the supplied profile with resolved sidewalk defaults. Its two reversed source edges share one forward run; `a` publishes one forward lane and `b` one backward lane, each 3.5 m wide at offset 0.

## Dependencies

- [Atlas](../../../CONTRACT.md): graph, district kinds, geometry grid and error vocabulary.
