# CONTRACT: atlas/ui

Purpose: presents Atlas creation and blueprint inspection in a dark browser workspace. It contains no generation logic.

## In

`new PreviewApp(fetchManifest?) -> PreviewApp`

- `generate(params)` takes [AtlasParams](../../schema/params.ts) and delegates to the root `generateCity` entry point.
- `setMode(mode)` takes `2d | 3d`; `resize()` fits both canvases; `setInteriorParcels(parcelIds)` applies an exact parcel subset.
- Parameter files are JSON AtlasParams. Unknown top-level fields are dropped, defaults are resolved, and the root runtime validation runs before the form changes.
- The optional assembled-world [manifest](../../../engine/src/assembly/schema/world-manifest.schema.json) is fetched beside the non-empty `out=` path in the parcel URL template. It must be contract 1.0.0 and match the displayed seed, Atlas version, complete parcel-id set, interior subset, and floor tags.

## Out and events

- `PreviewApp.root` is the mountable element. `viewMode` reports the active map mode. `generate` resolves after the generated blueprint is rendered or its error is shown.
- The Creation tab renders every Atlas parameter, presets, import and export. The Visualization tab renders the summary, filters, inspector, parcel link, legend, and 2D or 3D map.
- The 2D canvas renders blueprint polygons and supports left-drag pan, cursor-anchored wheel zoom, hover preview, and right-click selection.
- The WebGL2 canvas renders parcel envelopes and floor marks, partitioned ground, crossings, street furniture, highway structures, transit, water surfaces, shoreline bands, and optional diagnostics. Highway deck faces share their mitered cross-sections and omit zero-area triangles at grade ramp tips. Station-access diagnostics remain visible through the structures whose internal route they trace. Drag orbits, wheel zooms, and right-click selects a visible parcel.
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
- `widgets/InspectorPanel` and `widgets/ParcelLink`: hover or pinned measurements and the selected parcel's building URL or inline reason it is unavailable.
- `widgets/MapToolbar`: seed and size, fit action, and blueprint download. `widgets/BlueprintOverview` renders totals; `widgets/LegendWidget` renders the full color key.
- `widgets/Notifications` and `widgets/ProgressOverlay`: message log and blocking generation stages (`preparing | generating | rendering | ready | error`).
- `components/paramsFile`, `blueprintFile`, `rangeField`, `colors`, and `dom`: validated file exchange, synchronized numeric input, palettes, and element creation.

## Errors

The mounted UI exposes this closed failure set:

- Generation: root `E_INVALID_PARAMS`, `E_UNSATISFIABLE`, or `E_INVARIANT`, shown in the notification log. The progress cover always closes and the form unlocks.
- Parameter file: invalid JSON, non-object input, missing seed, or root parameter validation failure, shown in the notification log. The current form stays unchanged.
- Parcel link: disabled template, invalid URL, missing `out=`, or invalid output path, returned as `ParcelDestination.error` and shown in the inspector.
- Manifest: missing, failed, malformed, stale, or mismatched input leaves the interior list empty and reports it unavailable. It never widens the filter.

No failure escapes a `PreviewApp` event handler.

## Invariants

- Presentation only: CityBlueprint generation and validation stay in the root box.
- One valid parameter set produces the same blueprint as the root entry point. Import never changes a valid field before the complete set validates.
- The form is disabled for the complete generation interval. Progress moves through named stages and notifications preserve file and generation results.
- 3D geometry is deferred until the 3D view is first selected. Both views apply the same filters and exact interior parcel subset.
- Renderers consume published geometry and elevations. Water and shoreline layers stay independent; street and road surfaces stay disjoint and inside roadway ground.
- A normal click never pins or navigates. Right-click pins a feature and immediately opens a selected parcel in a new building view. The persistent inspector link remains available, always forces `mode=building` and the selected parcel id, and preserves the configured `out=` value.
- An optional manifest affects the UI only after exact seed, version, parcel-set, subset, and floor-shape validation.
- Downloaded blueprints are unchanged. Downloaded parameter files hold the full resolved form state.
- All controls and panels have square corners.

## Depends on

- [Atlas root contract](../../CONTRACT.md): AtlasParams, CityBlueprint, `generateCity`, and AtlasError.
- [Engine assembly contract](../../../engine/src/assembly/CONTRACT.md): optional world manifest 1.0.0.
