# Changelog

0.10.0: the plan is rectangles and blocks repeat. Blocks and lots are axis-aligned rectangles sized in whole 8 m modules, streets are straight runs between square junction boxes, and a generator invariant checks every published land and ground ring. `meta.blockTemplates` publishes one tiling per block size and zone; each block names the template it carries. The default city is 3000 x 3000 m and its plan is 7.9 MB. Coordinates land on the 1 mm grid. Package 0.10.0, blueprint 0.26.0.

0.9.1: tests cover the contract surface once each.

0.9.0: blueprint 0.26.0 publishes plain street corridor reservations. A straight corridor ends in a square cap of plain segments. Only a bend adds a fan, at a 15 degree step. Corridor sweep model 2.0.0, or 2.1.0 with explicit side geometry.

0.8.3: highway columns stand at each end of the clear stretches a crossing street cuts the deck into, with the rest spread evenly inside. A crossing up to 28 m wide is bridged at the 30 m pitch. The widest district avenue with median, curbs and underpass sidewalks is 27.6 m.

0.8.2: `schema/progress.ts` publishes twelve pipeline stages plus `GENERATION_RESULT`.

0.8.1: the creation form carries the street design: lane width per road class, four sidewalk band widths, crossing headroom and paving finish.

0.8.0: blueprint 0.25.0 publishes `meta.lotSizes`, six standard lot rectangles from 16x32 to 56x56 m. Ordinary parcels carry `lotSize`. 10 to 30 parcels per city are `landmark` on a merged plot.

0.7.2: the outer sidewalk ring stops at a shoreline that reaches the city boundary.

0.7.1: central luxury blocks use blue, surrounding rich blocks use red.

0.7.0: blueprint 0.24.0 uses uniform district sidewalk modules, whole-block finishes, 2 m parking and 3.4 m ornamental avenue medians.

0.6.2: native parking sides reserve a 3.5 m walking strip on the rear sidewalk.

0.6.1: building envelopes allocate 4 m clear height plus 0.5 m floor allowance (4.5 m nominal pitch).

0.5.0: blueprint 0.22.0 carries `architecture`. Physical underpass modules carry grade sidewalks beneath elevated highways. Optional `landmarkFloors` set exact tower heights. City creation uses templates, URL inspection and a blocking generation dialog.

0.21.0 blueprint: a seeded four-lane highway crosses the city interior on an 8 m deck.

0.20.0 blueprint: public transit is subway-only. Bus and train collections stay empty.

0.4.0: blueprint 0.17.0 publishes continuous street profiles, exact lanes and independent pedestrian bands reserved before parcels.

0.3.0: blueprint 0.16.0 publishes a shared half-metre building grid and rectangular footprints.

0.2.23: production build publishes `dist/cli.mjs` and the browser preview under `dist/preview/`.

0.2.22: optional lagoon, river and sea-coast hydrology.

0.2.17: one continuous 3D access path per subway entrance.

0.2.11: highway structures publish deck, ramps and 2 x 2 m supports at most 30 m apart.

0.2.10: traffic signals and street furniture (`planting`).

0.2.8: stations publish platform, box and shafts.

0.2.0: blueprint 0.4.0 carries levels (highway 8 m, subway -12 m).

0.1: `generateCity` behind CONTRACT.md, preview UI, generate CLI, samples/.
