# CONTRACT: atlas/ui

Purpose: dark browser workspace for creating and inspecting a CityBlueprint in a flat map or a 3D city view. Presentation only, no generation logic.

## In
A `CityBlueprint` (see ../../CONTRACT.md). The app generates one locally through `generateCity` from the params panel.

## Components
- views/PreviewApp: the preview itself, sidebar plus map. Methods: `generate(params)` (resolves once the city is on screen, or its failure reported), `resize()`. While a city builds, the form is locked behind a progress cover that reports preparing, generating, rendering and ready stages. Failures and file results land in the notification stack. The 3D geometry is deferred until 3D is selected. Right-clicking a 2D feature or 3D building selects it and opens the Visualization tab.
- views/Map3DView: WebGL2 renderer of the city in three dimensions. `new Map3DView(onParcelOpen?, onParcelInspect?)`. Methods: `shown()`, `setBlueprint(bp)`, `setFilters(filters)`, `resize(w, h)`, `resetView()`. Each parcel is one envelope prism with its floor elevations drawn across the facade, avoiding hidden floor caps inside the building. Ground cover lies in plates, streets run as ribbons under the ground plate and highway deck height reads the exact published elevation profile. Rail runs at its published level and corridor width, and stations show their headhouse, shaft, passage and platform. Optional diagnostic layers show highway centerlines, support volumes and station access paths. Geometry is normalized and merged per material. Drag orbits, wheel zooms, a right click over a building opens its popup and inspector.
- views/filters: `defaultFilters()` and the `FilterKey` set, one switch per ground surface, parcel type, street class, transit mode, furniture type, district outlines and diagnostic overlay.
- widgets/ViewModeSwitch: flat map or city in 3D. Event: `onChange(mode)`.
- widgets/ViewTabs: creation and visualization tabs. One control pane always remains visible.
- views/MapView: dark canvas renderer. `new MapView(onSelect?, onHover?)`. Methods: `setBlueprint(bp)`, `setFilters(filters)`, `setLayers(layers)`, `clearSelection()`, `resize(w, h)`, `resetView()`. Pan: left drag. Zoom: wheel, cursor-anchored. Hover previews a parcel, street, highway or station. Right click selects it. Each individual filter is honored, including street furniture and geometry diagnostics.
- widgets/ParamsPanel: complete AtlasParams editor. It exposes seed, width, depth, irregularity, district range, global and per-district floor caps, wealth weights and every feature toggle. Range values have an exact numeric input. Compact, city and metro presets retain the current seed; Reset restores defaults; Random seed changes only the seed. Invalid values disable Generate city and show the reason. Events: `onGenerate(params)`, `onExport(params)`, `onImport(file)`. Methods: `read()`, `setParams(params)`, `setStatus(text)`, `setBusy(busy)`.
- widgets/LayerToggles: grouped checkboxes for every ground surface, zone type, street class, transit mode, furniture type, districts and diagnostic overlay. Each item and group has an Only action. Show all, Hide all and Defaults act on the complete filter set. Event: `onChange(filters)`.
- widgets/LegendWidget: color swatches per parcel type and tier, ground, street, transit and diagnostic layer. Read-only.
- widgets/BlueprintOverview: current population, parcel, district and block totals plus highway ramp/support and transit counts. Method: `setBlueprint(bp)`.
- widgets/InspectorPanel: hover preview and pinned measurements for parcels, streets, highway structures and stations. Right-click pins a feature; Clear selection releases it. A selected parcel may open through ParcelLink.
- widgets/MapToolbar: persistent map help, current seed and dimensions, Fit city and Download blueprint actions. Method: `setBlueprint(bp)`.
- widgets/ParcelLink: URL template used by Open building view. The default points at the local engine viewer; empty means off. `linkFor(parcel, seed)` returns the URL or null. Tokens: `{seed} {parcelId} {blockId} {districtId} {type} {tier} {x} {z}`.
- widgets/Notifications: dismissible message stack. `error(message)`, `info(message, link?)`.
- widgets/ProgressOverlay: blocking stage display over the map. `show(stage, detail)`, `update(stage, detail)`, `hide()`. Stages are preparing, generating, rendering, ready and error.
- components/paramsFile: `parseParams(text)` (drops unknown top-level fields, resolves defaults and applies the generator's nested runtime validation, then throws with the reason on failure), `paramsFileName(seed)`, `downloadParams(params, filename)`.
- components/blueprintFile: `downloadBlueprint(bp)` writes the current CityBlueprint unchanged as JSON.
- components/rangeField: synchronized range and exact numeric input used by creation parameters.
- components/colors: `parcelColor(type, tier)`, `streetColor(class)`, transit and ground palette constants.
- components/dom: `el(tag, attrs, children)` helper.

## Errors
An AtlasError from generation becomes a notification carrying its code; a file that is not a parameter set becomes one carrying the reason. No throw escapes the UI.

## Depends on
- root box contract (schema/blueprint.ts, schema/params.ts, generateCity).
