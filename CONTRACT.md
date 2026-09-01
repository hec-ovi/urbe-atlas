# CONTRACT: atlas

Purpose: deterministically generates the 2D city blueprint (districts, streets, sidewalks, typed parcels, transit) from a seed and parameters.

Status: draft, schemas pending research.

## In (must cover)
- seed
- size and shape parameters
- feature toggles: highways, subways, air tunnels, underground tunnels
- limits: max floors (global and per district), district count ranges

## Out (must cover)
- world blueprint JSON: districts, street graph with widths and sidewalks, parcels with type, quality tier and 3D envelope (footprint polygon, height range), transit stops, stations and lines, zone statistics
- low poly volumetric city representation for map previews

## Errors
Closed set, to be defined.

## Depends on
None.
