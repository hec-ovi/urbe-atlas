# CONTRACT: atlas/ui

Purpose: browser preview of a CityBlueprint on a 2D pan/zoom plane, with the parameter form that builds it, a color legend and layer toggles. Presentation only, no generation logic.

## In
A `CityBlueprint` (see ../../CONTRACT.md). The app generates one locally through `generateCity` from the params panel.

## Components
- views/PreviewApp: the preview itself, sidebar plus map. Methods: `generate(params)` (resolves once the city is on screen, or its failure reported), `resize()`. While a city builds, the form is locked behind a progress cover; failures, file results and parcel clicks land in the notification stack.
- views/MapView: canvas renderer. `new MapView(onParcelClick?)`. Methods: `setBlueprint(bp)`, `setLayers(layers)`, `resize(w, h)`, `resetView()`. Pan: drag. Zoom: wheel, cursor-anchored. A click that is not a drag emits the parcel under the pointer.
- widgets/ParamsPanel: the full parameter form (seed, width, depth, irregularity, max floors, one checkbox per feature toggle). Events: `onGenerate(params)`, `onExport(params)`, `onImport(file)`. Methods: `read()`, `setParams(params)`, `setStatus(text)`, `setBusy(busy)`. Parameters with no control of their own (district count, per-district floor caps, tier weights) ride along from an imported file into the next export.
- widgets/LayerToggles: checkboxes for ground, zones, streets, transit, districts. Event: `onChange(layers)`.
- widgets/LegendWidget: color swatches per parcel type and tier, street classes, transit modes. Read-only.
- widgets/ParcelLink: URL template a parcel click opens, empty (the default) meaning off. `linkFor(parcel, seed)` returns the URL or null. Tokens: `{seed} {parcelId} {blockId} {districtId} {type} {tier} {x} {z}`.
- widgets/Notifications: dismissible message stack. `error(message)`, `info(message, link?)`.
- widgets/ProgressOverlay: blocking cover over the map. `show(text)`, `hide()`.
- components/paramsFile: `parseParams(text)` (throws Error with the reason), `paramsFileName(seed)`, `downloadParams(params, filename)`.
- components/colors: `parcelColor(type, tier)`, `streetColor(class)`, transit and ground palette constants.
- components/dom: `el(tag, attrs, children)` helper.

## Errors
An AtlasError from generation becomes a notification carrying its code; a file that is not a parameter set becomes one carrying the reason. No throw escapes the UI.

## Depends on
- root box contract (schema/blueprint.ts, schema/params.ts, generateCity).
