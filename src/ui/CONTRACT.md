# CONTRACT: atlas/ui

Purpose: presents Atlas creation and blueprint inspection in a dark browser workspace. It contains no generation logic.

## In

`new PreviewApp(fetchManifest?) -> PreviewApp`

- Startup loads [workspace forms](../cities/CONTRACT.md) from `GET /api/forms/creation` and `GET /api/forms/visualization`. Create and View are separate full workspaces. The UI iterates those documents; adding, removing or editing a supported control is a form JSON change.
- Supported widgets: heading, note, section, text, slider, select, choice, toggle, optional-number, action, action-row, presets, file, grid, layers. Unknown types render as a note and do not crash.
- `generate(params)` validates [AtlasParams](../../schema/params.ts), submits raw parameters to the [city catalog](../cities/CONTRACT.md), and waits for its queued or running blueprint job to finish.
- `refreshCities()` loads all persistent [CityRecord](../cities/schema.ts) entries. Startup refreshes the catalog and resumes status polling. Creating a city requires an explicit Generate city or Retry click. Delete asks for a second click, then `DELETE /api/cities/:id`.
- `loadBlueprint(value)` accepts saved [CityBlueprint](../../schema/blueprint.ts) data; `loadBlueprintUrl(source)` fetches the same format from this preview origin, without redirects. [Render input checks](components/blueprintInput.ts) require finite coordinate tuples, nonempty geometry, known rendered categories and the nested fields consumed by both views. Additional fields remain unchanged. This is structural inspection, not geometric certification.
- Startup `?blueprint=/relative/file.json` loads saved data without generation or fallback. Optional `view=3d` selects 3D. The toolbar's Open blueprint accepts a local JSON file through the same load flow.
- Local and URL opens inspect data. Save current city explicitly posts the displayed JSON to `/api/cities/import`; generated and reopened catalog entries are already saved.
- `setMode(mode)` takes `2d | 3d`; `resize()` fits both canvases; `setInteriorParcels(parcelIds)` applies an exact parcel subset.
- Parameter files are JSON AtlasParams. Unknown top-level fields are dropped, defaults are resolved, and the root runtime validation runs before the form changes.
- New forms, presets and Reset select paving from the creation form document: maintained finish, 1 m slab cells and optional 2 m groups on common stations, with 12 mm joints. Curb and border modules use the existing 0.15 m and 0.35 m widths. Their fit remains the producer's responsibility.
- The optional assembled-world [manifest](../../../engine/src/assembly/schema/world-manifest.schema.json) is fetched beside the non-empty `out=` path in the parcel URL template. It must be contract 1.0.0 and match the displayed seed, Atlas version, complete parcel-id set, interior subset, and floor tags.
- Exterior generation consumes the Engine [server contract](../../../engine/src/server/CONTRACT.md): capability, exact-blueprint POST and job polling. The Vite adapter proxies only `/api/exteriors` and its children to `ATLAS_ENGINE_API_URL` (default `http://127.0.0.1:5306`). `VITE_ENGINE_PREVIEW_URL` independently selects the browser viewer (default `http://localhost:5306/`).

## Out and events

- `PreviewApp.root` is the mountable element. `viewMode` reports the active map mode. `generate` resolves after terminal server status and automatic opening, or after reporting failure. A city opened during generation stays displayed; completion then reports that the new city is available in Saved cities.
- Create is a 70/30 split: the parameter form and the city list. View is a control rail plus the map. Opening a city, loading a blueprint or finishing generation shows View. Each city row shows seed, blueprint status, dimensions, source and creation time. Ready entries open their saved geometry; failed entries show their error and Retry creates a new job from the recorded parameters. Refresh cities reloads the catalog. Pending entries poll server status every 1.5 seconds while mounted.
- The creation form renders city controls, presets, import and export from its schema. Building footprint offers Rectangle (default) and Follow parcel. Street profiles and paving layouts round-trip through parameter files. The view form renders layer filters and 2D/3D choice; the rail also holds exteriors, summary, parcel link and legend. The `road` class is labeled avenues.
- The 2D canvas renders blueprint polygons and supports left-drag pan, cursor-anchored wheel zoom and left-click selection.
- The WebGL2 canvas renders parcel envelopes and floor marks, partitioned ground, crossings, street furniture, highway structures, transit, water surfaces, shoreline bands, and optional diagnostics. Highway deck faces share their mitered cross-sections and omit zero-area triangles at grade ramp tips. Station-access diagnostics remain visible through the structures whose internal route they trace. Drag orbits, wheel zooms, and left-click selects a visible parcel.
- Downloads return the current parameter set or the current CityBlueprint unchanged as JSON.
- `ParamsPanel` emits `onGenerate(params)`, `onExport(params)`, and `onImport(file)`.
- `CityLibrary` emits `onOpen(record)`, `onRetry(params)`, `onStatus(message)`, `onInfo(message)` and `onError(message)`.
- `LayerToggles` emits `onChange(filters)`. Workspace navigation emits Create or View.
- `MapView` emits `onSelect(hit)` and `onHover(hit | null)`; `Map3DView` emits `onParcelInspect(parcel)`.
- `MapToolbar` emits `onFit()` and `onDownload()`; `ParcelLink.onChange(listener)` observes template edits.

## Components

- `views/PreviewApp`: owns the mounted workspace, form fetch, generation flow, view state, manifest load, selection, downloads, and notifications.
- `views/WorkspaceNav`: Create or View.
- `components/Form`: iterates a workspace form document. `ui/Slider`: range plus exact numeric input.
- `views/MapView`: 2D canvas. Methods: `setBlueprint`, `setFilters`, `setInteriorParcels`, `setLayers`, `clearSelection`, `resize`, `resetView`, `render`.
- `views/Map3DView`: WebGL2 city view. Methods: `shown`, `setBlueprint`, `setFilters`, `setInteriorParcels`, `resize`, `resetView`, `render`.
- `views/StreetSurfaceRegions`: clips street and road meshes into disjoint regions inside the published roadway partition.
- `views/filters`: complete `FilterKey` set and deterministic `defaultFilters()` for hydrology, ground, zones, streets, transit, furniture, districts, diagnostics, and `interiorsOnly`.
- `widgets/ParamsPanel`: validated AtlasParams form. Methods: `read`, `setParams`, `setStatus`, `setBusy`.
- `widgets/CityLibrary`: catalog controls, status polling, generation completion, delete and explicit persistence. Methods: `refresh`, `generate`, `blueprintFor`, `setBlueprint`, `setBusy`. `components/CityApi` handles same-origin HTTP, forms, delete and record validation.
- `widgets/LayerToggles`: grouped visibility controls from the view form, with item and group isolation, global resets, and `setInteriorCount(count)`.
- `widgets/InspectorPanel`: nonmodal floating selection details, retained until Close, another selection or a new blueprint. `widgets/ParcelLink`: explicit assembled-output template, empty by default.
- `widgets/ExteriorPreview`: capability-gated Generate exteriors on the View rail, inline progress/reason and verified viewer destinations. `setBlueprint` discards prior job availability. HTTP requests and response identity checks remain independent of generation code.
- `widgets/MapToolbar`: seed and size, fit action, and blueprint download. `widgets/BlueprintOverview` renders totals; `widgets/LegendWidget` renders the full color key.
- `widgets/Notifications`: dismissible toasts lasting eight seconds, separate from selection details.
- `components/paramsFile`, `blueprintFile`, `rangeField`, `colors`, and `dom`: validated file exchange, synchronized numeric input, palettes, and element creation.

## Errors

The mounted UI exposes this closed failure set:

- City service: catalog HTTP errors, invalid responses and network failures. Read failures appear inline with Refresh; pending polling retries connection failures. Submission, import and worker failures appear in the notification log. Worker errors include root `E_INVALID_PARAMS`, `E_UNSATISFIABLE`, `E_INVARIANT`, service `E_GENERATION` and `E_INTERRUPTED`. Terminal generation and submission failure re-enable creation.
- Parameter file: invalid JSON, non-object input, missing seed, or root parameter validation failure, shown in the notification log. The current form stays unchanged.
- Saved blueprint: invalid JSON or render-input structure, disallowed URL, fetch failure, or rendering failure appears in the log. Structural failures leave the displayed city unchanged.
- Parcel link: disabled template, invalid URL, missing `out=`, or invalid output path, returned as `ParcelDestination.error` and shown in the inspector.
- Manifest: missing, failed, malformed, stale, or mismatched input leaves the interior list empty and reports it unavailable. It never widens the filter.
- Exterior service: unavailable capability, failed request/job, invalid response, mismatched identity or incomplete completion leaves building previews disabled and reports the reason. Stale responses cannot affect a different displayed blueprint.

No failure escapes a `PreviewApp` event handler.

## Invariants

- Presentation only: city generation and serialization run through the city service; the browser imports parameter validation and saved-file render checks.
- One valid parameter set produces the same blueprint as the root entry point. Import never changes a valid field before the complete set validates.
- Only creation submission and Retry are disabled for an active generation. Form editing, map viewing, tabs, local imports, catalog refresh and ready-city opening remain available. Status names describe queued, running, ready or failed blueprint work; generation has no covering overlay.
- Generation creates only blueprints. Exterior and interior work require their own explicit actions. Generated completion and older load responses cannot replace a more recently requested city.
- 3D geometry is deferred until the 3D view is first selected. Both views apply the same filters and exact interior parcel subset.
- Renderers consume published geometry and elevations. Water and shoreline layers stay independent; street and road surfaces stay disjoint and inside roadway ground.
- A left click selects without navigation. Movement beyond four screen pixels, pointer cancellation or release outside the canvas prevents selection. Right clicks never select or navigate.
- Building preview remains disabled with an inline reason while exact-blueprint exterior completion is unverified. An output path is never inferred from the seed.
- Exterior generation starts only on its enabled button click. Job hash must match SHA-256 of recursively key-sorted displayed JSON. Opening requires a successful job, all requested shell pairs completed, a matching manifest and the selected parcel in the completed set. Viewer links preserve the job's output and force the selected parcel and building mode. Legacy manifests alone never enable Open.
- An optional manifest affects the UI only after exact seed, version, parcel-set, subset, and floor-shape validation.
- Downloaded blueprints are unchanged. Downloaded parameter files hold the full resolved form state.
- Presets and Reset select rectangular buildings; omitted footprint shape imports use the root default. Changing form controls preserves imported street profiles and paving layouts.
- Imported paving settings retain their exact modules, grouping and finish selections. Omitted `pavingDesign` remains omitted. Only a new form, preset or Reset chooses the preview paving default, using owned copies. Numeric paving settings do not change source street dimensions or add geometry in the UI.
- All controls and panels have square corners.

## Depends on

- [Atlas root contract](../../CONTRACT.md): AtlasParams, runtime parameter validation, CityBlueprint and AtlasError.
- [City catalog contract](../cities/CONTRACT.md): durable blueprint generation, saved records, status, delete and workspace form documents.
- [Fitted paving contract](../streets/construction/paving/CONTRACT.md): caller-owned numeric layouts, grouped slabs and shared stations.
- [Engine assembly contract](../../../engine/src/assembly/CONTRACT.md): optional world manifest 1.0.0.
- [Engine server contract](../../../engine/src/server/CONTRACT.md): exterior capability and exact-city jobs.
