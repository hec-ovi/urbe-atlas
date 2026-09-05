# CONTRACT: alley planning

Purpose: cuts pedestrian connections across eligible blocks and joins their real surrounding streets.

## In and out

`AlleyPlanner.plan(blocks, junctions, districtOf, rng, network)` returns alley centerlines as `Polyline[]`, [Atlas types](../../../schema/blueprint.ts). The entry point is [../AlleyPlanner.ts](../AlleyPlanner.ts).

- `blocks`: road-facing land polygons after complete roadway subtraction.
- `junctions`: existing street node positions.
- `districtOf`: a point-to-district query; kind and tier control alley density.
- `rng`: an independent Atlas random stream.
- `network`: current street paths and the reserved street domain, [schema.ts](schema.ts).

## Invariants

- Each accepted cut selects the nearest true street or road intersection beyond both block mouths and publishes its snapped terminal. Highway paths are not pedestrian terminals. The graph consumer nodes those terminals against the same target paths.
- The complete published, 1 mm-snapped path stays inside the reserved street domain. Candidate geometry is checked before publication.
- Eligibility uses block dimensions, junction clearance and interior curb clearance. No viable joined candidate means no alley for that candidate slot.
- Identical inputs and random-stream seed produce identical output. Each block uses its own random fork.

## Errors

None. Inputs are validated block rings, graph paths and district data.

## Dependencies

- [Atlas](../../../CONTRACT.md): graph paths, district types and random streams.
- [Street domain](../domain/CONTRACT.md): whole-path containment.
- [Geometry](../../geom/CONTRACT.md): intersection arithmetic and coordinate grid.
