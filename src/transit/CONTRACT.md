# CONTRACT: transit planning

Purpose: plans connected bus and rail service with grade infrastructure reserved before lots.

## In / out

- `TransitPlanner(nodes, edges)` takes the Atlas graph with published widths and directed sidewalk bands.
- `planTrain(options)` takes `TrainOptions` and returns grade stations and lines for an early right-of-way reservation, [schema.ts](schema.ts).
- `planSubway(options)` takes district anchors, a pre-parcel population estimate, boundary, obstacle polygons and its seed stream. It returns stations, lines and the service-demand target, [schema.ts](schema.ts).
- Subway station exclusions are actual unavailable land polygons. The planner tests the full platform against them; callers do not expand those polygons by platform dimensions.
- `plan(options)` takes final population for buses and reuses the supplied early train and subway plans. Input: `TransitOptions` in [schema.ts](schema.ts). Output: [Atlas transit schema](../../schema/blueprint.ts).
- `STATION` and `RAIL` in [stations.ts](stations.ts) own platform, shaft, passage and track dimensions. `stationAccessOf` turns reserved shaft placements into continuous descending stairs and platform passages.

## Invariants

- A subway plan is fixed before subdivision. Each generated entrance has a full outboard bay; [reservations/CONTRACT.md](reservations/CONTRACT.md) owns its geometry.
- The subway service power law uses the published forecast. Final resident counts remain the zoning result and only affect subsequent bus service.
- No station is omitted because a sidewalk cannot contain its stairs. A station searches nearby clear bay positions; unavailable entrance land fails with `E_UNSATISFIABLE`.
- Rail endpoints land inside terminal platforms. Every station belongs to a line, and every line serves at least two stations. Access paths join the reserved entrance, shaft foot and platform handoff exactly.
- Terminal selection reserves two full platform lengths and their reachable bays. A short route or water-covered endpoint selects suitable land terminals; a graph without two complete terminal sites fails with `E_UNSATISFIABLE`.
- Bus stops use the actual travel-side furnishing band. Grade station access uses the actual side's walking band. Paths respect the root elevation connection groups.

## Errors

- `E_INVALID_PARAMS`: invalid subway demand or a final rail request without its early plan.
- `E_UNSATISFIABLE`: the graph cannot host two complete terminal platforms, or a selected station cannot reserve a complete reachable entrance bay.

## Dependencies

- [Atlas](../../CONTRACT.md): graph, district, geometry and error contracts.
- [Street construction](../streets/construction/CONTRACT.md): widths, directed sides and band queries.
- [Zoning](../zoning/CONTRACT.md): pre-parcel population forecast.
