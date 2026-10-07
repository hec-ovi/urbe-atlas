# Research conclusions

Decisions the generator applies. Subway, furniture and facility numbers are the sources behind the published contracts.

## Plan

- Axis-aligned rectangles on an 8 m module. Streets are straight segments between rectangular junction boxes. One axis carries at most two block sizes. An axis takes one block per 120 m of its land at every city size (the default 3 km city runs 24 x 24 blocks, most of them 114 m kerb to kerb).
- The 120 m pitch holds at 3 km since package 0.16.0. Measured on 2026-10-06 over 16 seeds: 576 blocks of 114 m (one row and column of 122 m) instead of 196 of 202 m, a crossing every 120 m instead of every 212 m, and a plan of about 24 MB instead of 9.4. Every one of the 16 seeds passes its invariants, against 5 failures at the old pitch and 9 at this one on 0.15.0: those failures were one bug, a region with many holes (the street grid around its blocks and median islands) split into simple rings with a depth limit that dropped the holes it did not reach, which left median islands under roadway and station bays without paving.
- Six standard lots, every dimension a multiple of 8 m: 16x32, 24x32, 24x40, 40x40, 40x56, 56x56 m. Industrial districts take only the four larger sizes. 10 to 30 landmark plots per city merge two or three neighbouring lots. Every size is whole 8 m bays, two or more each way, the edge Exterior's piece kit closes with two 4 m corner arms and N-1 bays, so a kit building stands on the whole lot; the 24 m sizes give the rich families their three bays, and 40 m sides give corporate sectors its five and Interior's composed floors their 26 m plate.
- At 114 m a block's buildable land is 104 m, 13 modules: two rows of 32 m lots leave a 40 m courtyard, two rows of 40 m a 24 m one, and no pair of catalog depths fills it. The courtyard stays and earns its place: the ring opens it onto a side street through a gate, the narrowest side-row lot left open, the way a perimeter block's Hof is reached through a Durchfahrt. Every open rectangle is then named as a yard (garden, court, working yard, station forecourt, planted strip), and open ground is 12 to 18 percent of block land against 29 percent at 202 m.
- Vendor sites are street kiosks and cabins of 2.5 to 4 m frontage by 2 to 3 m depth, the size range of newsstand kiosks, food cabins and repair booths. They stand on open block land, never on the 4.2 m sidewalk, so the 2.2 m walking band stays clear. A 3 km city holds about 200 to 330 at gates, 4 to 12 on station forecourts and one on each of its 40 or so squares.
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
