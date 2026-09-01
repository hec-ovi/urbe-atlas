# CONTRACT: atlas/ui

Purpose: browser preview of a CityBlueprint on a 2D pan/zoom plane with a color legend and layer toggles. Presentation only, no generation logic.

## In
A `CityBlueprint` (see ../../CONTRACT.md). The app generates one locally through `generateCity` from the params panel.

## Components
- views/MapView: canvas renderer. Props: blueprint, visible layers. Methods: `setBlueprint(bp)`, `setLayers(layers)`, `resetView()`. Pan: drag. Zoom: wheel, cursor-anchored.
- widgets/ParamsPanel: seed, size, irregularity, max floors, feature checkboxes, Generate button. Event: `onGenerate(params: AtlasParams)`.
- widgets/LayerToggles: checkboxes for ground, zones, streets, transit, districts. Event: `onChange(layers)`.
- widgets/LegendWidget: color swatches per parcel type and tier, street classes, transit modes. Read-only.
- components/colors: `parcelColor(type, tier)`, `streetColor(class)`, transit and ground palette constants.
- components/dom: `el(tag, attrs, children)` helper.

## Errors
Generation errors (AtlasError) render as a message in the params panel; no throw escapes the UI.

## Depends on
- root box contract (schema/blueprint.ts, schema/params.ts, generateCity).
