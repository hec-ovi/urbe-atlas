# CONTRACT: fitted paving

Purpose: fits whole paving cells and explicit residual surfaces to authoritative street ground.

## In and out

Data shapes: [schema.ts](schema.ts). Producer shapes: [producer-schema.ts](producer-schema.ts).

- `PavingPlanner.validateDesign(input: unknown): PavingDesign` validates settings before city generation and returns an owned copy of the declared fields. It needs no graph or district geometry. `plan` additionally checks overrides against published district IDs.
- `PavingPlanner.plan(input)` in [PavingPlanner.ts](PavingPlanner.ts) takes standalone ground polygons, published street graph and runs, district boundaries, explicit paving settings and optional station bay footprints. This legacy polygon entry preserves each supplied binary source independently. It returns replacement ground and paving data; roadway, block and open records pass through unchanged.
- `PavingPlanner.planShared(input)` takes the same construction settings plus `PavingGroundSource`: the caller's opaque exact partition, original city boundary, authored coordinate scale, editable semantic owner IDs and excluded owner IDs. It refines existing ownership, verifies the final partition and publishes sole ground polygons once. Curb and sidewalk retain source levels. No land is added outside the existing source domain.
- `PavingPlanner.validatePublished(city): void` takes serialized public city fields from `PublishedPavingInput`. It validates fitted construction references and proves that final ground polygons cover `meta.boundary` minus published water surfaces exactly once. It takes no original source polygons or certificate.

- Caller `PavingDesign` selects finish families, numeric layouts and district overrides. Atlas imports no material assets. A layout's module dimensions are cell pitches, including joints; nominal body dimensions are pitch minus joint.
- Optional `PavingDesign.roadwayLayoutId` selects the continuous roadway finish; omission selects `defaultLayoutId`. Modern construction publishes the resolved `roadwayLayoutId`. Roadway consumers use that layout's family without choosing a nearby region or seeded fallback.
- `StreetConstruction.paving` carries the selected layouts, frames and regions. Each region names its run, junction or station-bay owner, layout, frame and functional band.
- `GroundSurface.construction` references a region and either complete integer cell spans or one explicit solid role. `GroundSurface.polygon` remains the only render/collision owner polygon. Root ground `surface`, `bottom` and `top` remain authoritative.
- Modern fitted output is `1.1.0`. Its geometry-free `sources` records retain curb/sidewalk source identity, surface and levels; every region references one `sourceId`. Sources, frames and regions are all used. The `1.0.0` data shape remains readable, but the strict persisted validator requires modern fitted data. Unfitted legacy city validation belongs to the caller.

## Invariants

- Dimensions are finite metres. Producer pitches are at least 1 mm; each joint is nonnegative and smaller than its pitch. Border widths are nonnegative. IDs and references are unique and complete; frames have unit U directions. Cell spans are sorted by row and start, integer, nonempty and disjoint.
- A grid owner's polygon equals the union of its complete cell footprints. Explicit solid owners cover the remaining border and infill. All owners are disjoint and complete the source ground. No cell is clipped to its owner polygon.
- Functional bands remain independent of material role. A furnishing region contains actual furnishing land only. Shared junction and station-bay circulation is named separately. Curved returns and diagonal residuals retain their exact source boundaries.
- All owners in a frame use one phase and canonical stations. Run owners publish source distances; junction owners carry their incident arms. Consumers expand supplied spans, without selecting phase, finish family or cells.
- District boundaries select the caller's layout overrides. Unassigned land uses the default layout. Walking and shared junction circulation take precedence over furnishing where reservations overlap. Straight tangent fields fit whole cells; curved residuals are explicit solids on the exact source boundary.
- Band frames share their run-distance U datum. Selected band modules share one base U pitch and U joint within a layout, so curb and paving joints use the same stations. Narrow bands can use their own V pitch and joint.
- Across each full band, the frame centres the largest whole-row count that leaves the selected perimeter width. This V phase follows band and layout dimensions, independent of source polygon fragmentation.
- One exact source partition retains each ground owner through whole-band, tangent, district, border and protected-cell division. Its certificate is verified before publication. Derived solid intersections share one numeric conversion without lattice snapping; source coordinates and canonical cell corners remain unchanged. Certificates are not written into ground JSON.
- Persisted validation checks owner incidence against the independent city domain, not total area alone. Missing outer or internal owners, duplicate coverage and edits that break shared incidence fail. It also checks source surface/levels, region/owner/frame/module references, role compatibility, complete integer spans and canonical cell-owner equality. Only numeric representation roundoff is allowed at derived solid boundaries. Coherent internal-seam movement is detectable only when it also violates these references or canonical cells.

## Shared source lifecycle

- Ground construction creates and owns the exact partition. A non-mutating numeric snapshot may serve crossing and support planning; its polygons are views and never rebuild the partition.
- `planShared` consumes current editable ground-owner handles through documented partition operations. Its source record contains semantic metadata only, with no second owner-geometry cache or global registry. Empty owners may be present. Excluded owners remain in the complete partition proof and are omitted from ground output.
- Final publication uses the same surviving exact state. A prior snapshot does not prohibit another non-mutating `finish` call. The independent saved validator reads only final public geometry and metadata.
- Pass-through surfaces retain exact ownership and levels. Final outlines may include additional shared subdivision vertices where fitted neighbors meet them; numeric polygon arrays need not equal an earlier snapshot.
- Whole-band, shared-junction, offset, district and station-bay intents use authored 1 mm encoding. Shared-entry district and station-bay polygons must already lie on that lattice; off-grid inputs fail without snapping. Tangent masks are authored on the lattice once when constructed. Canonical cells use the same encoding. The standalone polygon entry uses binary operation encoding throughout.
- Shared crossings require published junction approaches when crossing records exist. `CrossingPlanner.construction(edge, {distance})` supplies exact source-edge landing masks with authored support endpoints and shared station fractions. Published field, landing and terminal views must equal that construction's numeric views. Full left/right landing masks reserve circulation within existing pedestrian owners; roadway passes through. Frames follow the published terminal quad direction and original incident node/arm references. Numeric landing views never replace their exact construction during subdivision.

## Integer grouping

- `PavingModule.pitch` is the complete slab footprint. Optional integer `baseCells` divides it into the shared base lattice; omission means `[1, 1]`. Each base pitch is at least 1 mm and each joint is smaller than its base pitch.
- A band's optional `grouping` selects another module using integer base-cell `period` and `offset`. Both dimensions of its period contain whole groups, and its offset aligns with group boundaries. The group and base module share base pitches and joints. A group is emitted only when every base cell fits; otherwise base slabs and explicit residual owners remain.
- For group column `c`, row `r` and local base indices `i`, `j`, evaluate `du = (c * baseCells[0] + i) * (pitch[0] / baseCells[0])` and `dv = (r * baseCells[1] + j) * (pitch[1] / baseCells[1])`, then use the coordinate formula below. The group perimeter retains every canonical base-cell corner.
- Consumers expand each group into those base quads. Only the outside group edges carry joint strips; internal base edges meet as body material with no center joint. Texture UV scale is independent of base pitch, group pitch and joint geometry. Consumers use the published group module and spans without inferring merges.

## Cell expansion

For integer column `c`, row `r`, compute `du = c * pitch[0]`, `dv = r * pitch[1]`. Evaluate `x = (origin[0] + u[0] * du) - u[1] * dv` and `z = (origin[1] + u[1] * du) + u[0] * dv`. Snap each coordinate once with `Math.round(value * 1000) / 1000`.

The four canonical cell corners define one bilinear map `Q(u,v)`. U cuts are `0`, `joint[0] / (2 * pitch[0])`, `1 - joint[0] / (2 * pitch[0])`, `1`; V cuts use the corresponding V dimensions. Reuse all derived points without further snapping. The middle rectangle is the body. Bottom and top strips span all U; left and right strips span only the middle V range. These five pieces exhaust the snapped cell once. Zero-width joints produce no strip. There is no full-area background face below them.

For a grouped module, apply this expansion to each base quad using base pitches in the joint fractions. Internal group strips use body material. Retain the standard joint-cut stations on every base boundary as render vertices, including internal boundaries, so neighboring base slabs share the same points. These subdivisions add no visible center joint.

## Finish roles

- Grid bodies use `constructionSurfaces.curb` on curb bands, `border` on border bands, and `pavingBody` otherwise. Grid joint strips use `joint`.
- Solid `body`, `crossing-field`, `approach` and `corner-infill` use `pavingBody`; other solid roles use the matching `joint`, `border` or `curb` finish.
- Producer solids on curb and border bands use their matching role. Other bands allow body, joint, border and corner-infill; crossing-field and approach roles require circulation ownership.
- `crossing-field` is raised pedestrian approach paving. Roadway and zebra geometry retain their separate owners. Curbs retain root curb elevations and their exact roadway-facing boundary.
- Finish texture repeat dimensions are independent of cell pitches. Frames provide physical UV origin and direction for tops and exposed boundary faces.

## Errors

- `E_INVALID_PARAMS`: malformed layouts, duplicate layout/module/override IDs, missing references, invalid dimensions, incompatible base stations or incomplete integer grouping settings.
- `E_INVARIANT`: incoherent graph/run references, malformed source geometry or levels, duplicate district or station-bay ownership, ground already carrying fitted construction, or a persisted fitted artifact failing its coverage, semantic, reference or cell checks.

## Dependencies

- [Street construction](../CONTRACT.md): through-runs and exact per-side bands.
- [Crossing construction](../../crossings/CONTRACT.md): source-edge interpolation for complete landing claims.
- [Atlas](../../../../CONTRACT.md): sole ground polygons, levels, coordinate grid and errors.
- [Source partition](../../../geom/partition/CONTRACT.md): exact shared ownership and protected canonical cells.
- [Published cover](../../../geom/partition/published/CONTRACT.md): independent saved-owner incidence and domain verification.
- Caller-supplied finish family IDs and numeric modules. The consuming renderer resolves the finish catalog.
