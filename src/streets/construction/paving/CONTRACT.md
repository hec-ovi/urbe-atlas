# CONTRACT: fitted paving data

Purpose: describes whole paving cells, explicit residual surfaces and their street-space ownership.

## In and out

Data shapes: [schema.ts](schema.ts). This data contract defines the additive root integration format.

- Caller `PavingDesign` selects finish families, numeric layouts and district overrides. Atlas imports no material assets. A layout's module dimensions are cell pitches, including joints; nominal body dimensions are pitch minus joint.
- `StreetConstruction.paving` carries the selected layouts, frames and regions. Each region names its run, junction or station-bay owner, layout, frame and functional band.
- `GroundSurface.construction` references a region and either complete integer cell spans or one explicit solid role. `GroundSurface.polygon` remains the only render/collision owner polygon. Root ground `surface`, `bottom` and `top` remain authoritative.

## Invariants

- Dimensions are finite metres. Pitches are positive; each joint is nonnegative and smaller than its pitch. Border widths are nonnegative. IDs and references are unique and complete; frames have unit U directions. Cell spans are sorted by row and start, integer, nonempty and disjoint.
- A grid owner's polygon equals the union of its complete cell footprints. Explicit solid owners cover the remaining border and infill. All owners are disjoint and complete the source ground. No cell is clipped to its owner polygon.
- Functional bands remain independent of material role. A furnishing region contains actual furnishing land only. Shared junction and station-bay circulation is named separately. Curved returns and diagonal residuals retain their exact source boundaries.
- All owners in a frame use one phase and canonical stations. Run owners publish source distances; junction owners carry their incident arms. Consumers expand supplied spans, without selecting phase, finish family or cells.

## Cell expansion

For integer column `c`, row `r`, compute `du = c * pitch[0]`, `dv = r * pitch[1]`. Evaluate `x = (origin[0] + u[0] * du) - u[1] * dv` and `z = (origin[1] + u[1] * du) + u[0] * dv`. Snap each coordinate once with `Math.round(value * 1000) / 1000`.

The four canonical cell corners define one bilinear map `Q(u,v)`. U cuts are `0`, `joint[0] / (2 * pitch[0])`, `1 - joint[0] / (2 * pitch[0])`, `1`; V cuts use the corresponding V dimensions. Reuse all derived points without further snapping. The middle rectangle is the body. Bottom and top strips span all U; left and right strips span only the middle V range. These five pieces exhaust the snapped cell once. Zero-width joints produce no strip. There is no full-area background face below them.

## Finish roles

- Grid bodies use `constructionSurfaces.curb` on curb bands, `border` on border bands, and `pavingBody` otherwise. Grid joint strips use `joint`.
- Solid `body`, `crossing-field`, `approach` and `corner-infill` use `pavingBody`; other solid roles use the matching `joint`, `border` or `curb` finish.
- `crossing-field` is raised pedestrian approach paving. Roadway and zebra geometry retain their separate owners. Curbs retain root curb elevations and their exact roadway-facing boundary.
- Finish texture repeat dimensions are independent of cell pitches. Frames provide physical UV origin and direction for tops and exposed boundary faces.

## Errors

The root producer uses `E_INVALID_PARAMS` for malformed layouts and `E_INVARIANT` for incoherent published ownership or references. This schema module has no callable error path.

## Dependencies

- [Street construction](../CONTRACT.md): through-runs and exact per-side bands.
- [Atlas](../../../../CONTRACT.md): sole ground polygons, levels, coordinate grid and errors.
- Caller-supplied finish family IDs and numeric modules. The consuming renderer resolves the finish catalog.
