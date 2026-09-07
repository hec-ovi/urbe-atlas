# CONTRACT: transit planning

Purpose: plans connected subway service with entrance land reserved before lots.

## In / out

- `TransitPlanner(nodes, edges)` takes the Atlas graph with published widths and directed sidewalk bands.
- `planSubway(options)` takes district anchors, a pre-parcel population estimate, boundary, obstacle polygons and its seed stream. It returns stations, lines and the service-demand target, [schema.ts](schema.ts).
- Subway station exclusions are actual unavailable land polygons. The planner tests the full platform against them; callers do not expand those polygons by platform dimensions.
- `STATION` and `RAIL` in [stations.ts](stations.ts) own platform, shaft, passage and track dimensions. `stationAccessOf` turns reserved shaft placements into continuous descending stairs and platform passages.

## Invariants

- A subway plan is fixed before subdivision. Each generated entrance has a full outboard bay; [reservations/CONTRACT.md](reservations/CONTRACT.md) owns its geometry.
- No station is omitted because a sidewalk cannot contain its stairs. A station searches nearby clear bay positions; unavailable entrance land fails with `E_UNSATISFIABLE`.
- Rail endpoints land inside terminal platforms. Every station belongs to a line, and every line serves at least two stations. Access paths join the reserved entrance, shaft foot and platform handoff exactly.
- Terminal selection reserves two full platform lengths and their reachable bays. A short route or water-covered endpoint selects suitable land terminals; a graph without two complete terminal sites fails with `E_UNSATISFIABLE`.

## Errors

- `E_INVALID_PARAMS`: invalid subway demand.
- `E_UNSATISFIABLE`: the graph cannot host two complete terminal platforms, or a selected station cannot reserve a complete reachable entrance bay.

## Dependencies

- [Atlas](../../CONTRACT.md): graph, district, geometry and error contracts.
- [Street construction](../streets/construction/CONTRACT.md): widths, directed sides and band queries.
- [Zoning](../zoning/CONTRACT.md): pre-parcel population forecast.
