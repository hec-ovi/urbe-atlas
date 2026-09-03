# Box map

- atlas (root): deterministic 2D city blueprint generator. CONTRACT.md, schemas in schema/, generator in src/. Mirrors the Interior core-feasibility and Exterior floor-constant contracts; imports no sibling runtime data.
- src/hydro: deterministic lagoon, river and sea-coast surfaces, shoreline construction bands, land exclusions and typed bridge/tunnel contacts. src/hydro/CONTRACT.md.
- src/ui: preview box (canvas map view with parcel picking, params panel with parameter import/export, progress cover, notifications, parcel link template, legend, layer toggles). src/ui/CONTRACT.md. Depends on the root contract and the optional Engine assembly manifest contract.
