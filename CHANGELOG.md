# Changelog

0.12.8: the CLI takes `--district-count MIN,MAX` and `--hydrology lagoon|river|sea-coast`, both validated by Atlas as in the library; output without them is unchanged. Package 0.12.8, blueprint 0.26.0.

0.12.7: suitable factories in industrial districts receive a deterministic one-third chance of a 3–6-floor envelope, bounded by the district and hosted core. Eligibility requires a lot at least 24 m wide on both sides and a hosted footprint at least 18 m wide on both sides. Decisions repeat by template slot; unselected factories retain their original low band and other parcel types retain their existing template bands and random streams. Factory nominal height allowance remains 10 m per floor; Exterior owns actual floor elevations. Package 0.12.7, blueprint 0.26.0.

0.12.6: every parcel's access point stands on a side of its own lot that fronts a street, at the line where the lot meets the street's paving. A block is tiled as a ring of rows, one along each frontage it has room for, at one catalog depth, so no lot is landlocked; the land the ring encloses is the block's courtyard. Package 0.12.6, blueprint 0.26.0.

0.12.5: every lot of one block template slot carries the same envelope band. The first block to use a template fixes each slot's floors from its own district and every later block builds that band there, so a block repeats with its buildings and a district's skyline comes from the templates it uses. Lots outside a template keep their own band, and floor pitch stays per use. Package 0.12.5, blueprint 0.26.0.

0.12.4: a rich or high_rich parcel sits on a lot at least 24 m wide on its short side, three 8 m bays. Blocks in rich districts cut only lots that wide, a block too small for one keeps the whole catalog and steps down to mid, and lower tiers keep their 16 m lots. Package 0.12.4, blueprint 0.26.0.

0.12.3: a parking bay ends in a 45 degree return over its 2 m end run. Its footprint keeps the full length at the kerb and pulls the back line in one end run at each end, 40 m2 for three 6 x 2 m slots, and it stands in the roadway ground record its module notched into the kerb. Package 0.12.3, blueprint 0.26.0.

0.12.2: a parking bay's footprint is exactly the roadway ground record its module notched into the kerb, one record per bay, checked inside generation on every plan. Package 0.12.2, blueprint 0.26.0.

0.12.1: parcel core hosting mirrors Interior's published core feasibility, a 1.6 m minimum strip depth and a 0.24 m deepest facade: walkup 10.38 x 7.58 m, walkup with two stairs 16.88 x 7.58 m, compact elevator core 12.38 x 11.58 m, standard elevator core 19.38 x 7.58 m, bands 11.58 m heavy and 7.58 m light. A test reads Interior's schema, so the mirror cannot drift. Package 0.12.1, blueprint 0.26.0.

0.12.0: every street parks on one kerb. A block reserves a parking bay on its south and west frontages, up to six 6 x 2 m slots as the zone gives and the frontage fits, on the 2 m station grid; a highway frontage and a divided avenue carry none. Selected four-lane avenues keep their 3.4 m ornamental median. Package 0.12.0, blueprint 0.26.0.

0.11.0: the clear street between two junction boxes is a whole multiple of 2 m, every building parcel allows two floors in at least 9 m, and a lot that cannot is published as a `park` with no envelope. One element never kills a plan: a junction box, a crossing, a corridor, a lot or the subway that fails its own check is published in its simplest valid form and listed in `report.degraded` with its id, kind and reason. Package 0.11.0, blueprint 0.26.0.

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
