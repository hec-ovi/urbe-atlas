# CONTRACT: crossing construction

Purpose: resolves source contacts and places complete crossings on their external approaches.

## In and out

`CrossingPlanner.contacts(input)` takes [CrossingSourceInput](schema.ts): grade-connected street nodes, exact street edges, their planning reservations and optional grade roadway. It returns `SourceContactPlan`, with no ground or obstacle input.

Each domain contains original groups, their pedestrian and traffic edge membership, internal edges and external arms with source-direction ends. A group creates junction demand when `junction` is true; an arm requires a final marking when `crossing` is true. Continuation, terminal and pedestrian-only groups remain present. Domain IDs are their first sorted original group ID. Domains and groups sort by original group ID; edges and arms sort by edge ID, then source end. Returned arrays are owned copies.

These are topological contact groups, not spatial return envelopes or crossing-field cuts. They retain every group's two-sided pedestrian arms and grade traffic arms, including unmarked alleys and highways. Groups without two-sided pedestrian arms are outside this contact model. Separate original grade groups remain separate unless the source-contact resolver connects them through an original edge. Root owns physical returns using these identities and authoritative edge/role geometry.

`CrossingPlanner.plan(input)` adds final ground owners and optional physical-obstacle polygons through `CrossingInput`. It returns crossing markings and junction approach records, `CrossingPlan`. Its `JunctionCrossing` extends the root `Crossing` with its required junction reference; root crossing consumers remain structurally compatible. `contacts`, `plan` and `validate` share one source resolver and domain projection. Final junction IDs and field geometry follow final placement, independently of the source-domain ID.

`CrossingPlanner.validate(input, plan)` accepts `CrossingValidationPlan`, including root-compatible crossing records, and checks the persisted plan and required junction references against those same public inputs.

One planning call reuses its resolved source contacts and prepared ground fields during internal output validation. Contact resolution shares prepared source fields across segment queries. Each field snapshots and validates geometry once, with exact boundary indexes and a lazy coordinate cover. Every footprint receives its own complete ownership proof. Public saved-plan validation builds fresh contacts and fields; no acceptance or input state persists across calls. Exact field exclusion proves foreign-traffic clearance for that field; its physical-obstacle check remains separate.

Source-conflict fields live for one edge check. Final placement prepares nearby foreign traffic and obstacles once per source edge, selected by all complete terminal-band sweeps with the existing 1 mm bounds padding. Distant masks cannot intrude a candidate. These fields leave scope after that edge's candidates are proved.

Optional `gradeRoadway` supplies the complete datum-clipped grade traffic, one polygon list for every positive-width source edge with a flat grade span. An empty list records a completely clipped source; omission is invalid. It is required when a mixed-height edge has a positive-length flat grade span. Omission uses exact planning roadways only for fully grade edges; unsupported mixed-grade input fails. Callers own these complete source masks, including edges without pedestrian sidewalks.

`CrossingPlanner.construction(edge, {distance})` takes the published source `StreetEdge` and one approach's directed centre distance. It returns [CrossingConstruction](schema.ts): exact field, connector and terminal edge masks. Each support endpoint is authored on the 1 mm grid; consumers pass `encoding: 'authored-1mm'`. The complete 3 m field must lie on one source segment. No other approach fields are required.

Junctions retain original node and connection-group identities (`nodeId:connection:index`). Source walking reservations and connected traffic determine each physical contact's extent. A contact extends through an original edge when that edge cannot hold its required source approaches; continuation or terminal groups gain no independent demand. Every external approach names its original incident group, node and edge, directed path distance, complete carriageway field and both crossing connectors.

`landings` are complete crossing-only connectors from the marked field to each walking-band center. They can include an unmarked roadway margin before the physical curb. `walkingLandings` are their terminal half-band strips, wholly on pedestrian ground and the declared walking band. These connectors grant no ordinary walking access to roadway.

The ordered crossing traversal is `[segment.from, segment.roadway.from, segment.roadway.to, segment.to]`. These exact band-center anchors follow each connector and the carriageway; a straight endpoint chord does not replace them. Legacy segments without `roadway` retain `[from, to]`. Traversal retains the declared crossing width and proves complete segment and join coverage against the field and connectors.

`station` is the full field interval in directed edge metres. `cut` is its junction-facing boundary: the lower station at an edge's `from` end and the upper station at its `to` end. Left/right still follow the directed edge. Lane paint approaching a junction ends before the opposite, exterior field boundary.

`walkingLandings` are four-vertex source-directed quads: low lateral at low/high station, then high lateral at high/low station. Their exterior boundary is vertices `[1]-[2]` at `edge.from`, `[0]-[3]` at `edge.to`. Walking runs use this exact published line as their minimum cut; source station metres alone do not reconstruct its sub-grid position.

## Invariants

- Crossing fields are 3 m along the street. Whole 0.5 m stripes repeat at 1 m pitch with equal end margins.
- Complete carriageway fields fit their own source reservation and final grade roadway, with no positive-area overlap of any other grade road reservation. Complete connectors fit final roadway, curb or sidewalk and avoid every foreign grade-road reservation. Terminal strips fit final curb or sidewalk and their own walking band.
- Every positive-width grade span contributes traffic reservation, including highways without sidewalks. Pedestrian approach eligibility does not limit traffic exclusion. Original connection groups retain both their pedestrian arms and their full grade traffic membership for source contact extent.
- Crossings use one straight source segment. Their complete footprints determine available station intervals; no stripe is clipped to fit.
- Source-long edges are canonicalized once. Field, connector and terminal corners share affine station fractions on those edges. Published numeric polygons use the exact partition's single conversion; downstream subdivision consumes the retained edge masks, not re-imported numeric views.
- Domains join only through original source edges. A frontier needs one source approach; an edge between two demanded domains needs two disjoint approaches. Complete terminal strips must fit the edge's own walking reservations and avoid traffic belonging to those connected domains. This can extend a real contact through short same-run fragments. Missing final pedestrian ground or a physical obstacle does not merge groups. Elevated projections never establish a grade contact. Stable original identities determine ordering.
- A grade connection with exactly two positive-width arms sharing one published through-run is a continuation and creates no crossing demand. One-arm terminals likewise create no junction. Motor-and-alley contacts, three-or-more-arm contacts, and two-arm groups with missing or different run identities retain their demand. Each external positive-width grade arm with both sidewalks in an eligible junction has exactly one approach; highway and pedestrian-alley arms have no marking demand.
- External fields have no positive-area overlap in their exact published numeric coordinates. Every published approach passes the same full-footprint checks after serialization.
- Complete land coverage uses the geometry contract's coordinate-cover envelope: 1 mm grid, outward normal strips at `grid / sqrt(2)` and bevel corners. The entire footprint must fit that diagnostic mask union; missing land has no thickness allowance. Connector traffic and physical-obstacle tests reject overlap with interior beyond the geometry contract's default 1 mm precision; marked fields exclude foreign traffic exactly. Widths and source geometry remain unchanged. Identical input produces identical output.

## Errors

- `E_INVALID_PARAMS`: malformed capability input.
- `E_UNSATISFIABLE`: a required contact domain has no valid external crossing approach.
- `E_INVARIANT`: published geometry or references violate construction ownership.

## Dependencies

- [Atlas](../../../CONTRACT.md): graph, final ground and error types.
- [Street construction](../construction/CONTRACT.md): directed walking bands and exact reservations.
- [Geometry](../../geom/CONTRACT.md): fixed-point regions and boundary precision.
- [Source partition](../../geom/partition/CONTRACT.md): exact edge construction and its numeric views.
- [Station intervals](intervals/CONTRACT.md): complete translated-footprint placement and coordinate-cover checks.
