# Research conclusions (2026 state of the art)

Compact decisions from the deep research pass. Full reasoning lives in the agents' digests; this file keeps what the implementation applies.

## Street network: tensor fields
- Approach: composite tensor field = weighted sum of basis fields with radial decay (grid bases, radial bases, boundary field along the city outline, low-amplitude noise rotation). Mixed morphology (grid patches + radial + organic) is field addition, no stitching. Reference: Chen et al. SIGGRAPH 2008.
- Irregular city boundary generated first (radial noise + chord cuts + arcs), fed in as a boundary basis and used to clip streamlines. This kills the perfect-square look at the source.
- Three streamline passes coarse to fine with separation dsep ratio 20:5:1 (highway ~400 m, road ~100 m, street ~20-40 m), RK4 integration, seeds of each pass taken from the previous pass endpoints so tiers connect by construction.
- Post-passes in order: join dangling streamlines, simplify (RDP), build planar graph (spatial-index intersections + quadtree snapping, snap radius < min dsep), delete residual stubs, rightmost-turn face walk for blocks, flood-fill reachability as a hard invariant.
- Reference code: ProbableTrain/MapGenerator (TS, LGPL, read only, do not vendor), t-mw/citygen (MIT), TheJanusStream/symbios-tensor (Rust, MIT, closest pipeline match).
- No implementation gives connectivity for free; the reachability check is a hard test.

## PRNG and determinism
- Core RNG: sfc32 seeded via splitmix32 (corrected reference version, discard first 12 outputs). One named sub-stream per subsystem (boundary, field, streets.highway/road/street, districts, blocks, parcels, transit.bus/train/subway), each derived by hashing label + index into the parent seed: retuning one subsystem never reshuffles another.
- Determinism hygiene: no Math.random/Date anywhere in generation; explicit total-order sorts with id tie-breaks; no iteration over identity-keyed Sets/Maps; Math.sin/cos are not spec-identical across engines, so trig results snap to the fixed-point grid immediately.

## Geometry kernel and parcels
- One kernel: clipper2-ts (pure TS, zero deps, BSL-1.0, active 2026). Integer fixed-point coords at 1 unit = 1 mm; every vertex snaps to that grid before any boolean/offset. Wrapped in an internal geom module so it stays swappable. Turf unsuitable for planar offsets.
- Sidewalks by block insetting: sidewalkRing = block minus inflatePaths(block, -width), miter joins with limit ~2. Corner continuity is structural. Buildable area = the inset polygon.
- Subdivision, selected per block: regular blocks (OBB fill ratio > 0.75) recursive OBB split with orthogonal-split frontage fallback; irregular/curved blocks offset-strip subdivision (inset by lot depth, cut the perimeter ring at lot-width spacing, leftover core = open area); big-box/mall/factory 1-3 lots, no recursion. Straight skeleton skipped for v1 (WASM dep, sliver heuristics).
- Sliver control: reject parcels under lotAreaMin / lotWidthMin / frontageMin or over aspect cap, merge into the neighbor sharing the longest edge (never delete, that breaks coverage).
- Lot dimension bands (m): row housing 6-8 frontage x 27-30 depth; detached 8-12 x 30; apartment min frontage ~24; commercial 15-40 x 30-60; big-box site 1.6-2.4 ha; residential block length cap ~305.

## Street and sidewalk widths (defaults, m)
- Lane 3.0 urban, 3.35 on transit routes. Carriageway: street 6.7-8.5, road 8.5-9.75, highway 3.75/lane.
- Sidewalk through zone: 1.5 min, 1.8 desired, 2.4 adjacent to traffic; 1.5-2.1 residential, 2.4-3.7 downtown/commercial; wider on roads than streets, none on highways.

## Transit
- Stop spacing (core/mid/outer, m): bus 300/400/600; subway 700/1000/1400; train 1500/3000/5000. Bus parallel-route spacing ~800.
- Counts by population P: bus routes round(12*(P/100k)^0.65) clamp [4,250]; subway lines round(3.5*(P/1M)^0.6), 0 below 300k; train lines round(4*(P/1M)^0.5), 0 below 150k; main train stations 1 below 500k, 2 to 2M, 3-5 above.
- Topology by size: small radial bus only; mid radial bus + 1 rail terminus; large radial+ring subway + grid bus feeders + regional rail through 1-3 big stations.
- Route construction (deterministic): pick terminal anchor pairs by weight (CBD, interchanges, corpo/office, hospital, mall, dense residential, industrial, coverage for poor districts ~30-40% of routes), connect by shortest path on street graph weighted edgeLength/(1+adjacentDemand) with a penalty on already-served edges, snap stops at target spacing, far-side of intersections, >= 26 m clearance.
- Station dimensions (m): metro island platform 140 long x 8 wide (car 20-23 m, 6-car train, Delhi Metro practice; island width typical 6-10, egress-derived minimum 6-7.3); regional at-grade platform 180 x 6 (Metra/FRA, typical 150-200 long, 4-6 wide). Cut-and-cover metro platform at -12 m: a standard two-level box (concourse over platform) runs 12-17 m deep. Street stair shaft 8 m along the street by up to 3 m across (NFPA 130 minimum stair 1.12 m, built 2.4-3.6 m); concourse corridor 4 m (code 1.5-2.4, typical 3-5). NFPA 130 caps platform-to-exit travel at 100 m.
- Coverage targets as tests: >= 90% residential parcels within 400 m of a bus stop; every station on >= 1 line; each rail network connected.

## Urban statistics and ratios
- Facility ratios (residents per facility): hospital 75k (US 1/56k, URDPFI 1/250k), clinic 15k (URDPFI), police station 50k (URDPFI 1/90k, US 1/28k), fire by radius not ratio (1.5 mi first engine), restaurant ~590 (1.7/1000 US metro), coffee shop 3.6k (IBISWorld), supermarket/pharmacy ~5k, hotel 1 per 5.3k residents (AHLA), community mall 1 per ~100k (ICSC ladder: neighborhood 2.8-11.6k m2 GLA, community 11.6-37k, regional 37-74k).
- Districts: real districts 4-8 km2 and 80-200k people, split into 5-10 neighborhoods of 40-80 ha (Perry unit: 65 ha, 5-9k people, 400 m walk). Pedshed 400 m bus / 800 m rail.
- Blocks: Manhattan 80x274 m, Eixample 113x113, Portland 61x61, medieval ~40 m spacing; walkability caps: side <= 110 m (ITDP), area <= 2.4 ha preferring 0.8-1.2 (CNU). Lots: US suburban median 794 m2, rowhouse 5-6 x 24-30 m, walk-up bar 12-18 m wide.
- Land use split of developed area: streets 27-33% (cores to 36%, suburbs ~15%), residential 35-40%, commercial ~3%, industrial 5-8%, public 8-11%, open 15-20%. Street network density target: cores > 100 intersections/km2, >= 18 km street/km2.
- FAR by zone (real codes): residential poor 1.5-3.0 (walk-ups 4-6 floors, elevator required at 5), mid 2.0-4.0 (5-12), rich 0.5-1.5 (villas 1-3), high rich 6.5-10 (towers 12-40, 3.7 m floors); offices 6-10 (10-30 floors, 4.0 m); corpo 10-15 (30-80, 4.6 m); commerce 1-2 (1-3, 4.5 m); mall 0.4-1 (1-3, 5.5 m); hotel 3-6.5 (5-20, 3.2 m); hospital 1.5-2.5 (4-10, 4.0 m); police/military 1-2 (2-4, 3.6 m); factory 0.4 (1-2, ~10 m clear height).
- Employment density: office 10-15 m2/worker, warehouse 70-95; jobs-housing balance 1.5 jobs per unit. Household size ~2.5.
- Wealth geography model: radial term with a sign flip (Global North rich edges, Global South/historic Europe rich center), Hoyt elite wedge along transport toward high ground and clean waterfront with the poor sector ~180 degrees opposite, industry never adjacent to elite (place into low-tier parcels), rail/highway corridors are wealth-discontinuity edges, park adjacency premium decays to zero at ~150 m.
- Corrections found: the WHO 9 m2 green space per capita figure is a citation myth (use 0.5-1 ha public green within 300 m instead); measured bus stop spacing is US mean 352 m and Europe wider (Berlin 412, Helsinki 611), metro ~1050 m heavy rail.

Sources: Chen et al. street_sig08 (sci.utah.edu), tmwhere.com/city_generation.html, github.com/ProbableTrain/MapGenerator, github.com/t-mw/citygen, github.com/TheJanusStream/symbios-tensor, Vanegas et al. 2012 parcels, CityEngine block parameters (doc.arcgis.com), github.com/countertype/clipper2-ts, angusj.com/clipper2, NACTO Urban Street Design Guide, Seattle Streets Illustrated, findingspress.org bus stop spacings, humantransit.org, pedestrianobservations.com, ITDP BRT guide, TCRP 19, redblobgames PRNG writeup (simblob.blogspot.com/2022/05/upgrading-prng.html), NFPA 130 means of egress, Delhi Metro Rail Corporation cut-and-cover station practice, FRA/Metra station platform guidelines, BART Facilities Standards.
