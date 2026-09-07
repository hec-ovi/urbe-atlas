# CONTRACT: atlas/ui

Purpose: presents city creation, saved blueprint inspection and server job progress in a dark browser workspace.

## In

- `new PreviewApp(fetchManifest?)` exposes `root: HTMLElement`, `ready: Promise<void>` and `viewMode: '2d' | '3d'`.
- `startPreview(app, search)` loads the catalog. The base URL opens creation with a new random seed. `?city=id` opens the saved [CityRecord](../cities/schema.ts); `?blueprint=/file.json` opens same-origin [CityBlueprint](../../schema/blueprint.ts) JSON. `view=3d` selects 3D. Neither startup nor reload starts generation.
- Creation and visualization load their [WorkspaceForm](../cities/forms/schema.ts) documents concurrently from `/api/forms/creation` and `/api/forms/visualization`. Views iterate their documents. Supported widgets: heading, note, section, text, slider, select, choice, toggle, optional-number, action, action-row, presets, file, grid and layers. Unknown widgets render a note.
- `generate(params)` validates [AtlasParams](../../schema/params.ts), submits raw parameters to the [city service](../cities/CONTRACT.md), observes [GenerationProgress](../../schema/progress.ts), then opens the completed blueprint. `refreshCities()` reloads the catalog. `openCityId(id)` opens a ready saved record.
- `loadBlueprint(value)` and `loadBlueprintUrl(source)` inspect saved data. [Render input checks](components/blueprintInput.ts) require finite coordinates, nonempty geometry, known rendered categories and the nested fields consumed by both views. Extra fields are retained. URL requests stay on the preview origin and reject redirects.
- `showCreation(updateUrl = true)` returns to creation, selects a fresh seed and clears query parameters. `setMode(mode)` selects `2d | 3d`; `resize()` fits both canvases; `setInteriorParcels(ids)` selects an exact parcel subset.
- Optional manifest input follows the Engine [world manifest schema](../../../engine/src/assembly/schema/world-manifest.schema.json). The request is derived from the parcel URL template's explicit, nonempty `out=` path.
- Exterior generation uses the Engine [server contract](../../../engine/src/server/CONTRACT.md). The preview adapter proxies `/api/exteriors` and children to `ATLAS_ENGINE_API_URL` (default `http://127.0.0.1:5306`). `VITE_ENGINE_PREVIEW_URL` sets the browser viewer (default `http://localhost:5306/`).

## Out and events

- Creation displays the form beside the city catalog in a 70/30 split. The template dropdown applies Compact, City or Metro settings while preserving the seed. Building footprint offers Rectangle and Follow parcel; Waterfront offers None, Lagoon, River and Sea coast. Subway is the public transit option. Generate city submits the form.
- Opening saved geometry or completing generation displays the map and its control rail. Catalog opens write `?city=id`; the Atlas home link returns to creation. City rows show seed, status, dimensions, source and creation time. Ready records open; failed records show their error and Retry submits their recorded parameters. Delete requires a second click. Pending saved records poll every 1.5 seconds while mounted.
- Generation covers the workspace with a native modal dialog and makes its background inert. The progress bar, stage count and phase label use completed server stages, not elapsed-time estimates. Cancel deletes the server job; the modal stays locked until deletion is confirmed. A failed Cancel reports an inline reason and enables retry. Successful cancellation prevents pending status or blueprint responses from opening a city.
- Errors and status appear inline in the header, form, catalog or generation dialog.
- The 2D canvas supports left-drag pan, cursor-anchored wheel zoom and left-click selection. The 3D canvas supports orbit drag, wheel zoom and left-click parcel inspection. The map toolbar fits the map, opens local blueprint JSON and downloads the displayed blueprint unchanged.
- `ParamsPanel` emits `onGenerate(params)` and supports `read`, `setParams`, `newSeed`, `setStatus`, `setBusy`.
- `CityLibrary` emits `onOpen(record)`, `onRetry(params)`, `onStatus(message)`, `onInfo(message)`, `onError(message)` and supports `refresh`, `generate`, `cancelGeneration`, `blueprintFor`, `setBusy`.
- `LayerToggles.onChange(filters)` updates [Filters](views/filters.ts); `MapView.onSelect(hit)` and `onHover(hit | null)` report map features; `Map3DView.onParcelInspect(parcel)` reports parcels. `MapToolbar` emits `onFit`, `onDownload` and `onImport(file)`. `ParcelLink.onChange(listener)` reports template edits.

## Components

- `views/PreviewApp`: mounted workspace, URL selection, generation requests, view state, manifests and downloads. `views/WorkspaceHeader`: Atlas home link and inline status.
- `components/Form`: form document iteration. `ui/Slider`: range and synchronized exact numeric input. `widgets/ParamsPanel`: creation parameters and submission.
- `widgets/CityLibrary`: catalog display and saved-job polling. `components/CityApi`: same-origin HTTP and response validation. `components/CityGeneration`: active job observation and confirmed cancellation. `widgets/GenerationDialog`: modal stage progress and cancellation action.
- `views/MapView`: 2D polygons. `views/Map3DView`: WebGL2 geometry. Both accept blueprints, filters and interior parcel IDs, and expose resize, resetView and render. `views/StreetSurfaceRegions`: disjoint roadway-clipped street materials.
- `views/ModuleMeshes`: repeated physical street prisms, grouped by template and role into instanced meshes.
- `widgets/LayerToggles`: item and group filters, isolation and defaults. `widgets/InspectorPanel`: persistent closable selection details. `widgets/MapToolbar`: blueprint identity and file actions. `widgets/BlueprintOverview` and `widgets/LegendWidget`: totals and color key.
- `widgets/ParcelLink`: explicit assembled-output template, empty by default. `widgets/ExteriorPreview`: capability-gated exterior generation, job progress and verified viewer links.

## Errors

- City service failures include HTTP/network errors, invalid or mismatched records, invalid stage counts and worker failures (`E_INVALID_PARAMS`, `E_UNSATISFIABLE`, `E_INVARIANT`, `E_GENERATION`, `E_INTERRUPTED`). Read errors offer Refresh; generation connection errors retry. Submission and terminal worker errors release the modal and allow another submission.
- Invalid parameters prevent submission. Invalid saved JSON, malformed render fields, disallowed URLs, fetch errors and render failures report inline; structural failures preserve the displayed blueprint.
- Parcel links reject invalid URLs, missing `out=` and invalid output paths. Missing, malformed or mismatched manifests leave the interior set empty.
- Unavailable exterior capability, failed requests/jobs, invalid responses and incomplete completion keep building previews disabled with an inline reason. Stale responses cannot affect a different blueprint.

No failure escapes a `PreviewApp` event handler.

## Invariants

- City generation and persistence belong to the city service. The browser validates input and renders published geometry; it does not run the generator.
- A generation request blocks all workspace interaction until completion, failure or confirmed cancellation. Cancel works during submission, worker execution and blueprint loading. Late responses cannot replace a more recently selected city.
- Exterior and interior work require separate explicit actions. 3D geometry is deferred until the first 3D selection. Both renderers use the same filters and exact interior subset.
- Renderers use published polygons and elevations. Water and shoreline filters stay independent. Street and avenue surfaces are disjoint and remain inside roadway ground. Highway deck, underside and barriers share mitered cross-sections; ramp tips omit zero-area faces. Station-access diagnostics remain visible through station structures.
- Optional [street modules](../streets/construction/modules/schema.ts) render their exact prism heights, metre UVs, quarter turns and repeated stations in 3D. Geometry is shared per definition and role. Matching `moduleBlockId` planning covers stay in the 2D map. Gutters and guardrails have separate filters; saved blueprints without modules retain polygon rendering. Replacing a city disposes geometry and instance buffers.
- A left click selects without navigation. Movement beyond four screen pixels, pointer cancellation or release outside the canvas prevents selection. Right clicks never select or navigate. Selection persists until Close, another selection or a new blueprint.
- Exterior jobs must match the SHA-256 of recursively key-sorted displayed JSON. Opening a building requires successful complete shell pairs, a matching manifest and the selected parcel in the completed set. Viewer URLs preserve the output and force the selected parcel and building mode.
- Manifest contract 1.0.0 must match the displayed seed, Atlas version, complete parcel set, interior subset and floor tags. Optional manifests never widen the interior filter.
- New forms and templates choose owned copies of the form's paving default: maintained 1 m slab cells, optional 2 m groups, 12 mm joints, 1 m curb stations, 0.2 m curb width and 1 m border panels. Supplied paving and street profiles survive form edits exactly; omitted paving remains omitted. Module geometry belongs to the producer.
- Blueprint downloads retain all fields. Controls and panels have square corners; slider values align left and use labels without meter suffixes.

## Depends on

- [Atlas root](../../CONTRACT.md): parameter validation, blueprint and error schemas.
- [City catalog](../cities/CONTRACT.md): durable jobs, stage progress, cancellation, catalog and forms.
- [Fitted paving](../streets/construction/paving/CONTRACT.md): numeric layouts, slab groups and shared stations.
- [Street modules](../streets/construction/modules/CONTRACT.md): shared physical prism definitions and repeated placements.
- [Engine assembly](../../../engine/src/assembly/CONTRACT.md) and [Engine server](../../../engine/src/server/CONTRACT.md): optional manifests and exact-city exterior jobs.
