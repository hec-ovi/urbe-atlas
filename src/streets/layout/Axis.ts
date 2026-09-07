import { Rng } from '../../core/rng';
import { invalidParams, unsatisfiable } from '../../errors';
import type { RoadProfile } from '../construction/schema/design';

export interface GridAxis {
  roads: { position: number; width: number; profile: RoadProfile }[];
  panels: number[];
  min: number;
  max: number;
}

export function axis(extent: number, profiles: RoadProfile[], rng: Rng): GridAxis {
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
  const widths = profiles.map(profile => profile.lanes.reduce((sum, lane) => sum + lane.width, 0)
    + profile.shoulders.left + profile.shoulders.right);
  if (widths.some(width => !Number.isFinite(width) || width <= 0)) {
    throw invalidParams('street grid profiles require 1, 2 or 4 lanes with positive widths');
  }
  const count = Math.max(2, Math.floor((extent - 44) / 120));
  const selected = Array.from({ length: count + 1 }, (_, i) => {
    const eligible = profiles.map((profile, index) => ({ profile, width: widths[index] }))
      .filter(item => i % 3 === 0 ? item.profile.lanes.length === 4 : item.profile.lanes.length <= 2);
    if (!eligible.length) throw invalidParams('street grid requires both local and avenue profiles');
    return eligible[rng.int(0, eligible.length - 1)];
  });
  const roadSpace = selected.reduce((sum, item) => sum + item.width, 0);
  const pairs = Math.floor((extent - 44 - roadSpace - count) / 2);
  const base = Math.floor(pairs / count);
  if (base < 24) throw unsatisfiable('city axis cannot fit two whole-panel blocks', { extent });
  const panels = Array.from({ length: count }, (_, i) => (base + (i < pairs % count ? 1 : 0)) * 2);
  for (let i = 0; i < count; i++) {
    const target = rng.int(0, count - 1);
    const transfer = Math.min(rng.int(0, 5), (panels[i] - 48) / 2) * 2;
    panels[i] -= transfer;
    panels[target] += transfer;
  }
  const short = rng.int(0, count - 1);
  const long = (short + rng.int(1, count - 1)) % count;
  const stretch = Math.min(Math.floor(base / 3), (panels[short] - 48) / 2) * 2;
  panels[short] -= stretch;
  panels[long] += stretch;
  const span = roadSpace + panels.reduce((sum, value) => sum + value + 1, 0);
  const min = (extent - span) / 2;
  let position = min;
  const roads = selected.map((road, index) => {
    const center = position + road.width / 2;
    position += road.width + (panels[index] === undefined ? 0 : panels[index] + 1);
    return { ...road, position: center };
  });
  return { roads, panels, min, max: min + span };
}
