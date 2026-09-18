# Street layout

Places a rectangular street grid from lane widths and whole sidewalk panel counts.

`GridLayout.plan(input)` takes [GridLayoutInput](schema.ts) and returns [GridLayoutPlan](schema.ts).

`moduleFormat: 'district'` (the generateCity default) uses one 4.2 m sidewalk profile and finish per complete block, 0.2 m curbs, 0.5 m gutters and 2 m parking depth. The 0.2 m inner separators sit outside integer panel counts; total block allowance is 1.8 m. Selected interior four-lane runs nearest supplied district centers reserve a 3.4 m median separately from their lanes. Highway and perimeter runs are ineligible. The optional center list defaults to the city center. District blocks require the shared 4.2 m sidewalk profile.

Omitted format is source construction: paved widths 2, 4 or 6 m with the module kit's 0.2 m curb and 0.3 m gutter.

Street profiles supply 1, 2 or 4 lanes. A caller selects each side's resolved sidewalk profile and finish from its district.

`highway: true` reserves one four-lane interior through-run before block dimensions are calculated. The independent highway seed stream chooses its row or column within the middle half of the grid indices. At least one block remains on both sides. `highwayRunId` identifies the reserved grade run; the caller assigns its highway class and elevations. Omission or false publishes no highway reservation.

Row and column lengths vary independently. Each axis includes a shorter and a longer span in whole 8 m modules while preserving its total panel count. Blocks run about 120 m and grow with the square root of the city beyond a kilometre. Each row and column keeps one road profile. Blocks contain whole 2 m panel groups, square corners and their buildable rectangles. Graph intersections are row/column identities. Roadway rectangles have disjoint interiors. Modules supply the road-facing corner returns.

The reserved rectangle remains inside the requested size. An optional perimeter profile constructs continuous outer sidewalks and supplies their directed edge sections. Optional `perimeter.exclusions` are land the ring may not stand on (water reaching the city boundary): the ring stops at that shoreline, publishing one frontage per remaining stretch of the side, and the land it vacates returns to the caller.

Native parking takes one kerb of every street: a block reserves a bay on its south and west frontages (sides 0 and 3), which parks each street on one side. District bays are 4 m paved (6 x 2 m slots, 2.2 m walking), source bays 6 m paved (6 x 2.5 m slots, 3.5 m walking). Reserved highway frontages and avenues with a median reservation are ineligible. A bay holds 1 to 6 slots, the smaller of what the zone gives (residential and mixed 6, industrial 5, commercial 4, downtown 3) and what the frontage fits; it is centred on the frontage, starts on an even station at least 8 m from the run origin, and keeps 2 m support aprons with 6 m clear of corners. Guardrails occupy 2, 4 or 6 m groups on sparse seeded frontages, at most two groups per block. Parking and rail choices use independent seed streams. Same seed, settings and side selection produce identical data.

The plan retains `planning.frontages` and `planning.corners` from the original module producers. Frontages name their actual source graph edges. Outer sidewalks retain their own directed supports. Null corner references mark straight handoffs between owners. `planning.protected` carries non-owning underpass references supplied by the underpass producer. This metadata assigns no additional ground.

`LayoutPlanning.retain(planning, ownerIdMap)` filters source supports to retained owners and applies the caller's owner-ID mapping. Frontage/corner IDs and all coordinates remain unchanged. `LayoutPlanning.add` appends a block or perimeter plan onto the shared planning record.

Invalid profiles or nonboolean feature flags throw `E_INVALID_PARAMS`; a size that cannot fit two whole-panel blocks on each axis throws `E_UNSATISFIABLE`.

Dependencies: [construction](../construction/CONTRACT.md), [modules](../construction/modules/CONTRACT.md), [Atlas](../../../CONTRACT.md).
