# CONTRACT: atlas/ui

Purpose: presents Atlas creation and blueprint inspection in a dark browser workspace. It contains no generation logic.

## In

`new PreviewApp(fetchManifest?) -> PreviewApp`

- `generate(params)` takes [AtlasParams](../../schema/params.ts) and delegates to the root `generateCity` entry point.
- `loadBlueprint(value)` accepts saved [CityBlueprint](../../schema/blueprint.ts) data; `loadBlueprintUrl(source)` fetches the same format from this preview origin, without redirects. [Render input checks](components/blueprintInput.ts) require finite coordinate tuples, nonempty geometry, known rendered categories and the nested fields consumed by both views. Additional fields remain unchanged. This is structural inspection, not geometric certification.
- Startup `?blueprint=/relative/file.json` loads saved data without generation or fallback. Optional `view=3d` selects 3D. The toolbar's Open blueprint accepts a local JSON file through the same load flow.
- `setMode(mode)` takes `2d | 3d`; `resize()` fits both canvases; `setInteriorParcels(parcelIds)` applies an exact parcel subset.
- Parameter files are JSON AtlasParams. Unknown top-level fields are dropped, defaults are resolved, and the root runtime validation runs before the form changes.
- The optional assembled-world [manifest](../../../engine/src/assembly/schema/world-manifest.schema.json) is fetched beside the non-empty `out=` path in the parcel URL template. It must be contract 1.0.0 and match the displayed seed, Atlas version, complete parcel-id set, interior subset, and floor tags.

## Out and events

- `PreviewApp.root` is the mountable element. `viewMode` reports the active map mode. `generate` resolves after the generated blueprint is rendered or its error is shown.
- The Creation tab renders city controls, presets, import and export. Building footprint offers Rectangle (default) and Follow parcel. Street profiles and paving layouts round-trip through parameter files. The Visualization tab renders the summary, filters, parcel link, legend, and 2D or 3D map. The `road` class is labeled avenues.
- The 2D canvas renders blueprint polygons and supports left-drag pan, cursor-anchored wheel zoom and left-click selection.
- The WebGL2 canvas renders parcel envelopes and floor marks, partitioned ground, crossings, street furniture, highway structures, transit, water surfaces, shoreline bands, and optional diagnostics. Highway deck faces share their mitered cross-sections and omit zero-area triangles at grade ramp tips. Station-access diagnostics remain visible through the structures whose internal route they trace. Drag orbits, wheel zooms, and left-click selects a visible parcel.
- Downloads return the current parameter set or the current CityBlueprint unchanged as JSON.
- `ParamsPanel` emits `onGenerate(params)`, `onExport(params)`, and `onImport(file)`.
- `LayerToggles` emits `onChange(filters)`; `ViewModeSwitch` emits `onChange(mode)`; `ViewTabs` emits `onChange(tab)`.
- `MapView` emits `onSelect(hit)` and `onHover(hit | null)`; `Map3DView` emits `onParcelInspect(parcel)`.
- `MapToolbar` emits `onFit()` and `onDownload()`; `ParcelLink.onChange(listener)` observes template edits.

## Components

- `views/PreviewApp`: owns the mounted workspace, generation flow, view state, manifest load, selection, downloads, and notifications.
- `views/MapView`: 2D canvas. Methods: `setBlueprint`, `setFilters`, `setInteriorParcels`, `setLayers`, `clearSelection`, `resize`, `resetView`, `render`.
- `views/Map3DView`: WebGL2 city view. Methods: `shown`, `setBlueprint`, `setFilters`, `setInteriorParcels`, `resize`, `resetView`, `render`.
- `views/StreetSurfaceRegions`: clips street and road meshes into disjoint regions inside the published roadway partition.
- `views/filters`: complete `FilterKey` set and deterministic `defaultFilters()` for hydrology, ground, zones, streets, transit, furniture, districts, diagnostics, and `interiorsOnly`.
- `widgets/ParamsPanel`: validated AtlasParams form. Methods: `read`, `setParams`, `setStatus`, `setBusy`.
- `widgets/ViewTabs` and `widgets/ViewModeSwitch`: creation or visualization pane and flat or 3D map selection.
- `widgets/LayerToggles`: grouped visibility controls with item and group isolation, global resets, and `setInteriorCount(count)`.
- `widgets/InspectorPanel`: nonmodal floating selection details, retained until Close, another selection or a new blueprint. `widgets/ParcelLink`: explicit assembled-output template, empty by default.
- `widgets/MapToolbar`: seed and size, fit action, and blueprint download. `widgets/BlueprintOverview` renders totals; `widgets/LegendWidget` renders the full color key.
- `widgets/Notifications`: dismissible toasts lasting eight seconds, separate from selection details. `widgets/ProgressOverlay`: blocking generation stages (`preparing | generating | rendering | ready | error`).
- `components/paramsFile`, `blueprintFile`, `rangeField`, `colors`, and `dom`: validated file exchange, synchronized numeric input, palettes, and element creation.

## Errors

The mounted UI exposes this closed failure set:

- Generation: root `E_INVALID_PARAMS`, `E_UNSATISFIABLE`, or `E_INVARIANT`, shown in the notification log. The progress cover always closes and the form unlocks.
- Parameter file: invalid JSON, non-object input, missing seed, or root parameter validation failure, shown in the notification log. The current form stays unchanged.
- Saved blueprint: invalid JSON or render-input structure, disallowed URL, fetch failure, or rendering failure appears in the log and unlocks the UI. Structural failures leave the displayed city unchanged.
- Parcel link: disabled template, invalid URL, missing `out=`, or invalid output path, returned as `ParcelDestination.error` and shown in the inspector.
- Manifest: missing, failed, malformed, stale, or mismatched input leaves the interior list empty and reports it unavailable. It never widens the filter.

No failure escapes a `PreviewApp` event handler.

## Invariants

- Presentation only: generation and geometric certification stay in the root box; saved-file structural checks protect renderer inputs.
- One valid parameter set produces the same blueprint as the root entry point. Import never changes a valid field before the complete set validates.
- The form is disabled for the complete generation interval. Progress moves through named stages and notifications preserve file and generation results.
- 3D geometry is deferred until the 3D view is first selected. Both views apply the same filters and exact interior parcel subset.
- Renderers consume published geometry and elevations. Water and shoreline layers stay independent; street and road surfaces stay disjoint and inside roadway ground.
- A left click selects without navigation. Movement beyond four screen pixels, pointer cancellation or release outside the canvas prevents selection. Right clicks never select or navigate.
- Building preview remains disabled with an inline reason while exact-blueprint exterior completion is unverified. An output path is never inferred from the seed.
- An optional manifest affects the UI only after exact seed, version, parcel-set, subset, and floor-shape validation.
- Downloaded blueprints are unchanged. Downloaded parameter files hold the full resolved form state.
- Presets and Reset select rectangular buildings; omitted footprint shape imports use the root default. Changing form controls preserves imported street profiles and paving layouts.
- All controls and panels have square corners.

## Depends on

- [Atlas root contract](../../CONTRACT.md): AtlasParams, CityBlueprint, `generateCity`, and AtlasError.
- [Engine assembly contract](../../../engine/src/assembly/CONTRACT.md): optional world manifest 1.0.0.
