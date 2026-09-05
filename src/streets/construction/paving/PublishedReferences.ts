import type { GroundSurface } from '../../../../schema/blueprint';
import { invariantFailure } from '../../../errors';
import { validateStreetSections } from '../validateSections';
import { BANDS, resolvePavingDesign } from './Design';
import type { PublishedPavingInput } from './producer-schema';
import type { PavingConstruction, PavingFrame, PavingLayout, PavingRegion, PavingSource } from './schema';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const point = (value: unknown): value is [number, number] => Array.isArray(value)
  && value.length === 2 && finite(value[0]) && finite(value[1]);

function table<T extends { id: string }>(values: T[], name: string): Map<string, T> {
  if (!Array.isArray(values)) throw invariantFailure(`published paving needs ${name}`);
  const result = new Map<string, T>();
  for (const value of values) {
    if (!value || typeof value.id !== 'string' || !value.id.trim() || result.has(value.id)) {
      throw invariantFailure(`published paving ${name} need unique nonempty ids`);
    }
    result.set(value.id, value);
  }
  return result;
}

export class PublishedReferences {
  readonly construction: Extract<PavingConstruction, { version: '1.1.0' }>;
  readonly layouts: Map<string, PavingLayout>;
  readonly frames: Map<string, PavingFrame>;
  readonly regions: Map<string, PavingRegion>;
  private readonly sources: Map<string, PavingSource>;
  private readonly used = new Set<string>();

  constructor(private readonly city: PublishedPavingInput) {
    const construction = city?.streets?.construction?.paving;
    if (!construction || construction.version !== '1.1.0') {
      throw invariantFailure('published paving requires fitted construction version 1.1.0');
    }
    this.construction = construction;
    this.layouts = table(construction.layouts, 'layouts');
    this.frames = table(construction.frames, 'frames');
    this.regions = table(construction.regions, 'regions');
    this.sources = table(construction.sources, 'sources');
    if (!this.layouts.has(construction.roadwayLayoutId)) throw invariantFailure('published paving roadway layout is missing');
    try {
      resolvePavingDesign({ layouts: construction.layouts, defaultLayoutId: construction.layouts[0]?.id, districtLayouts: [] });
    } catch {
      throw invariantFailure('published paving layouts violate the design contract');
    }
    if (!Array.isArray(city.streets.nodes) || !Array.isArray(city.streets.edges)
      || !Array.isArray(city.transit?.subwayStations) || !Array.isArray(city.transit.trainStations)) {
      throw invariantFailure('published paving needs street and station references');
    }
    validateStreetSections({ streets: city.streets });
    for (const source of this.sources.values()) {
      if (!['curb', 'sidewalk'].includes(source.surface) || !finite(source.bottom) || !finite(source.top) || source.bottom > source.top) {
        throw invariantFailure('published paving source has invalid surface or levels', { sourceId: source.id });
      }
    }
    for (const frame of this.frames.values()) {
      if (!point(frame.origin) || !point(frame.u) || frame.gridStep !== 0.001
        || Math.abs(Math.hypot(...frame.u) - 1) > Number.EPSILON * 16) {
        throw invariantFailure('published paving frame has invalid coordinates or direction', { frameId: frame.id });
      }
    }
    const usedSources = new Set<string>(), usedFrames = new Set<string>();
    for (const region of this.regions.values()) {
      const source = region.sourceId && this.sources.get(region.sourceId);
      if (!source || !this.layouts.has(region.layoutId) || !this.frames.has(region.frameId)
        || !(BANDS as readonly string[]).includes(region.band) && region.band !== 'circulation'
        || (source.surface === 'curb') !== (region.band === 'curb')) {
        throw invariantFailure('published paving region has invalid source, band, layout or frame', { regionId: region.id });
      }
      this.owner(region);
      usedSources.add(source.id); usedFrames.add(region.frameId);
    }
    if (usedSources.size !== this.sources.size || usedFrames.size !== this.frames.size) {
      throw invariantFailure('published paving retains an unused source or frame');
    }
  }

  ground(ground: GroundSurface): PavingRegion | undefined {
    if (!ground || !finite(ground.bottom) || !finite(ground.top) || ground.bottom > ground.top
      || !['roadway', 'curb', 'sidewalk', 'block', 'open'].includes(ground.surface)) {
      throw invariantFailure('published ground has invalid surface or levels');
    }
    const fitted = ground.surface === 'curb' || ground.surface === 'sidewalk';
    if (!ground.construction) {
      if (fitted) throw invariantFailure('published fitted surface has no construction');
      return undefined;
    }
    const region = this.regions.get(ground.construction.regionId);
    const source = region?.sourceId && this.sources.get(region.sourceId);
    if (!fitted || !region || !source || ground.surface !== source.surface
      || ground.bottom !== source.bottom || ground.top !== source.top) {
      throw invariantFailure('published ground disagrees with its paving source', { regionId: ground.construction.regionId });
    }
    this.used.add(region.id);
    const part = ground.construction.part;
    if (!part || part.kind !== 'grid' && part.kind !== 'solid') throw invariantFailure('published paving part is invalid');
    if (part.kind === 'solid') {
      const roles = region.band === 'curb' || region.band === 'border' ? [region.band]
        : ['body', 'joint', 'border', 'crossing-field', 'approach', 'corner-infill'];
      if (!roles.includes(part.role)) throw invariantFailure('published paving solid role disagrees with its band');
      if ((part.role === 'crossing-field' || part.role === 'approach') && region.band !== 'circulation') {
        throw invariantFailure('published paving approach is outside circulation ownership');
      }
    }
    return region;
  }

  complete(): void {
    if (this.used.size !== this.regions.size) throw invariantFailure('published paving retains an unused region');
  }

  private owner(region: PavingRegion): void {
    const owner = region.owner;
    if (!owner) throw invariantFailure('published paving region has no street owner');
    if (owner.kind === 'run') {
      const run = this.city.streets.construction!.runs.find(run => run.id === owner.runId);
      const member = run?.edges.find(member => member.edgeId === owner.edgeId);
      if (!member || !['left', 'right'].includes(owner.side) || !point(owner.station)
        || owner.station[0] < member.start || owner.station[1] > member.end || owner.station[0] >= owner.station[1]) {
        throw invariantFailure('published paving run reference or station interval is invalid', { regionId: region.id,
          owner, member });
      }
    } else if (owner.kind === 'junction') {
      const node = this.city.streets.nodes.find(node => node.id === owner.nodeId);
      if (!node || !Array.isArray(owner.edgeIds) || new Set(owner.edgeIds).size !== owner.edgeIds.length
        || owner.edgeIds.some(id => !node.edgeIds.includes(id))) {
        throw invariantFailure('published paving junction has invalid incident arms', { regionId: region.id });
      }
    } else if (owner.kind === 'station-bay') {
      const station = [...this.city.transit.subwayStations, ...this.city.transit.trainStations].find(station => station.id === owner.stationId);
      if (!station || !Number.isSafeInteger(owner.entranceIndex) || owner.entranceIndex < 0
        || !station.entranceBays?.[owner.entranceIndex]) {
        throw invariantFailure('published paving station bay reference is invalid', { regionId: region.id });
      }
    } else throw invariantFailure('published paving street owner kind is invalid');
  }
}
