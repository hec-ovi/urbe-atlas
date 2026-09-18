import { Rng } from '../../core/rng';
import { invalidParams, unsatisfiable } from '../../errors';
import type { RoadProfile } from '../construction/schema/design';
import { roadwayTotal } from '../construction/Design';
import { measure } from '../construction/modules/Format';

/** Blocks are sized in whole modules, the same 8 m the lot catalog is cut on. */
const MODULE = 8;
/** Shortest block face that still hosts a row of standard lots. */
const MIN_PANEL = 48;
/**
 * Land kept outside the outermost street, both sides together: the perimeter
 * sidewalk ring plus the slack the module rounding leaves. It stays under the
 * reach a highway run may end from the city edge.
 */
const MARGIN = 24;

export interface AxisOptions { blockGap?: number; centralAvenue?: boolean; medianIndices?: number[] }

export interface GridAxis {
  roads: { position: number; width: number; profile: RoadProfile }[];
  panels: number[];
  min: number;
  max: number;
  highwayIndex?: number;
}

export function axis(extent: number, profiles: RoadProfile[], rng: Rng, highwayRng?: Rng, options: AxisOptions = {}): GridAxis {
  if (!Number.isFinite(extent) || extent < 1 || !Array.isArray(profiles) || profiles.length === 0) {
    throw invalidParams('street grid requires a finite size and road profiles');
  }
  if (profiles.some(profile => !profile || !Array.isArray(profile.lanes) || ![1, 2, 4].includes(profile.lanes.length)
    || profile.lanes.some(lane => !lane || !Number.isFinite(lane.width) || lane.width <= 0
      || !['forward', 'backward'].includes(lane.direction))
    || !profile.shoulders || ![profile.shoulders.left, profile.shoulders.right].every(width => Number.isFinite(width) && width >= 0)
    || !Array.isArray(profile.classes) || !profile.classes.includes(profile.lanes.length === 4 ? 'road' : 'street'))) {
    throw invalidParams('street grid profiles require 1, 2 or 4 lanes with positive widths and valid classes');
  }
  const widths = profiles.map(roadwayTotal), gap = options.blockGap ?? 1;
  if (widths.some(width => !Number.isFinite(width) || width <= 0)) {
    throw invalidParams('street grid profiles require 1, 2 or 4 lanes with positive widths');
  }
  // Blocks run about 120 m and grow with the square root of the city beyond a
  // kilometre, so a 3 km city gets 200 m superblocks instead of 25 more streets.
  const land = Math.max(extent - MARGIN, 1);
  const count = Math.max(2, Math.min(Math.floor(land / 120), Math.round(Math.sqrt(land * 1000) / 120)));
  const highwayIndex = highwayRng?.int(Math.max(1, Math.ceil(count / 4)), Math.min(count - 1, Math.floor(count * 3 / 4)));
  const selected = Array.from({ length: count + 1 }, (_, i) => {
    const eligible = profiles.map((profile, index) => ({ profile, width: widths[index] }))
      .filter(item => (i === highwayIndex || i % 3 === 0 || options.centralAvenue && i === Math.floor(count / 2))
        ? item.profile.lanes.length === 4 : item.profile.lanes.length <= 2);
    if (!eligible.length) throw invalidParams('street grid requires both local and avenue profiles');
    const selected = eligible[rng.int(0, eligible.length - 1)];
    if (!options.medianIndices?.includes(i)) return selected;
    if (i === highwayIndex || i === 0 || i === count || selected.profile.lanes.length !== 4) throw invalidParams('median requires an interior grade avenue');
    const profile = { ...selected.profile, id: `${selected.profile.id}-median`, median: { width: 3.4 } };
    return { profile, width: roadwayTotal(profile) };
  });
  const roadSpace = selected.reduce((sum, item) => sum + item.width, 0);
  const panelLand = land - roadSpace - count * gap;
  // Every panel is a whole number of 8 m modules, so a city is a few block
  // sizes repeated and two blocks of one size carry one lot tiling.
  const base = Math.floor(panelLand / count / MODULE) * MODULE;
  if (base < MIN_PANEL) throw unsatisfiable('city axis cannot fit two whole-panel blocks', { extent });
  // One axis carries two block sizes: the base, and the base plus a module
  // where there is land for it. Which blocks get it is seeded.
  const panels = Array.from({ length: count }, () => base);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let spare = Math.floor((panelLand - base * count) / MODULE);
  for (let i = 0; i < count && spare > 0; i++, spare--) panels[order[i]] += MODULE;
  const span = measure(roadSpace + panels.reduce((sum, value) => sum + value + gap, 0));
  const min = measure((extent - span) / 2);
  let position = min;
  const roads = selected.map((road, index) => {
    const center = measure(position + road.width / 2);
    position = measure(position + road.width + (panels[index] === undefined ? 0 : panels[index] + gap));
    return { ...road, position: center };
  });
  return { roads, panels, min, max: min + span, highwayIndex };
}
