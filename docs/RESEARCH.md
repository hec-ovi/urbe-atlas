# Research conclusions

Decisions the generator applies. Subway, furniture and facility numbers are the sources behind the published contracts.

## Plan

- Axis-aligned rectangles on an 8 m module. Streets are straight segments between rectangular junction boxes. One axis carries at most two block sizes. Blocks run about 120 m and grow with the square root of the city beyond a kilometre (the default 3 km city runs 200 m blocks).
- Holding the 120 m pitch at 3 km, for walkability, was measured on 2026-10-02 (package 0.15.0) and not taken. It gives 114 m blocks kerb to kerb, the size a 1 km city has: a crossing every 120 m instead of every 212 m, and empty courtyard falls from 29 to 6 percent of block land. The building plans a city draws stay about the same (229 and 338 against 341 and 337 for two seeds) while parcels grow 25 to 50 percent. Against it: 576 blocks instead of 196, 625 junctions, 1334 signal heads instead of about 500, 145 km of street instead of 86, a 23 MB plan instead of 9.4, and more plans fail their invariants. Of 16 seeds at 3 km, 9 failed at the 120 m pitch and 5 at the current one, mostly station bays whose reserved land lacks sidewalk paving. The same 5 fail on 0.13.1, so the current rate predates 0.14. Smaller blocks wait until station bays and the roadway and gutter overlap hold on any grid.
- Six standard lots, every dimension a multiple of 8 m: 16x32, 24x32, 24x40, 40x40, 40x56, 56x56 m. Industrial districts take only the four larger sizes. 10 to 30 landmark plots per city merge two or three neighbouring lots.
- Districts are rectangles on the city grid, clipped to the city outline. Default count is about 2 per sqrt(km2): a village [1, 2-3], the default 3 km city [4, 8].

## Geometry and determinism

- One kernel: clipper2-ts. Integer fixed-point coordinates at 1 unit = 1 mm; every vertex snaps to that grid before boolean or offset work. Named sub-streams per subsystem, derived from the seed; no `Math.random` in generation.

## Streets

- District modules: 1/2/4 lanes at 4/7/14 m carriageway, 4.2 m paved sidewalks (4 m panels plus a 0.2 m inner separator), 0.2 m curb, 0.5 m gutter, 2 m parking. Selected central four-lane runs reserve a 3.4 m ornamental median (2 m paving, 0.2 m curb and 0.5 m gutter per side).
- Highway deck 8 m, terminal ramps 60 m, support pitch 30 m, 2 x 2 m columns, 1 m construction clearance. A crossing footprint must stay under 28 m.
- Street trees 8 m apart in downtown and commercial districts, 12 m elsewhere (NACTO). Furniture stands in the kerb-side furnishing band, 6 m clear of a crossing, station entrance or door. A light pole every third station. Signals: one head per arm of an at-grade junction of 3+ streets where one is a road; the mast reaches the roadway centerline (right-hand traffic).

## Subways

- Service target: round(3.5*(P/1M)^0.6), clamped to 1-6 lines. The pre-parcel population forecast fixes this target.
- Station dimensions (m): metro island platform 140 long x 8 wide. Cut-and-cover platform at -12 m. Street stair shaft 8 m along the street by 3 m across, 1 m apron. NFPA 130 caps platform-to-exit travel at 100 m; an underground entrance is at most 30 m from its platform.

## Urban statistics

Facility ratios (residents per facility), applied in `src/zoning/ratios.ts`: hospital 75k, clinic 15k, police 50k, military 400k, mall 90k, hotel 5.5k, restaurant 550, coffee shop 3k, commerce 400. Gross floor area 35 m2 per resident, residential efficiency 0.8.

Sources: NACTO Urban Street Design Guide, NFPA 130, Delhi Metro cut-and-cover practice, URDPFI, IBISWorld, AHLA, ICSC, clipper2-ts.
