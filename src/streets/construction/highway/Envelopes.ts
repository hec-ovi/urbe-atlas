import { invariantFailure } from '../../../errors';
import { length as pathLength } from '../../../geom/polyline';
import { LEVELS } from '../../../levels';
import { HIGHWAY_WIDTH } from '../../widths';
import { HIGHWAY_DECK } from './dimensions';
import { highwayElevationProfile, levelAt } from './Profiles';
import { runEdges } from './RunEdges';
import { highwayRuns } from './Runs';
import type { HighwayConstructionEdge, HighwayEnvelope } from './schema';

const PROFILE_EPSILON = 1e-7;

/** Shared construction plan, also used before routing profiles are assigned. */
export function designHighwayEnvelopes(edges: readonly HighwayConstructionEdge[]): HighwayEnvelope[] {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  return highwayRuns(edges).map((run) => {
    const first = byId.get(run.edgeIds[0])!;
    const width = first.width ?? HIGHWAY_WIDTH;
    const level = first.level ?? LEVELS.highway;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(level) || level <= HIGHWAY_DECK.thickness) {
      throw invariantFailure(`highway ${first.id} has invalid construction dimensions`);
    }
    for (const id of run.edgeIds) {
      const edge = byId.get(id)!;
      if (Math.abs((edge.width ?? HIGHWAY_WIDTH) - width) > 1e-9
        || Math.abs((edge.level ?? LEVELS.highway) - level) > 1e-9
        || !Number.isFinite(edge.width ?? HIGHWAY_WIDTH)
        || !Number.isFinite(edge.level ?? LEVELS.highway)) {
        throw invariantFailure(`highway construction dimensions disagree with edge ${id}`);
      }
    }
    const total = pathLength(run.path);
    const maxRamp = total / ((run.rampAtStart ? 1 : 0) + (run.rampAtEnd ? 1 : 0) || 1);
    const ramps = {
      start: run.rampAtStart ? Math.min(HIGHWAY_DECK.rampLength, maxRamp) : 0,
      end: run.rampAtEnd ? Math.min(HIGHWAY_DECK.rampLength, maxRamp) : 0,
    };
    return {
      edgeIds: run.edgeIds,
      path: run.path,
      width,
      level,
      deckThickness: HIGHWAY_DECK.thickness,
      ramps,
      elevationProfile: highwayElevationProfile(total, level, ramps),
    };
  });
}

export function highwayEnvelopes(edges: readonly HighwayConstructionEdge[]): HighwayEnvelope[] {
  const envelopes = designHighwayEnvelopes(edges);
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  for (const envelope of envelopes) {
    for (const part of runEdges(envelope, byId)) {
      const profile = part.edge.elevationProfile;
      if (profile === undefined) continue;
      if (profile.length < 2
        || Math.abs(profile[0].distance) > PROFILE_EPSILON
        || Math.abs(profile[profile.length - 1].distance - part.length) > PROFILE_EPSILON
        || profile.some((point, index) => !Number.isFinite(point.distance) || !Number.isFinite(point.level)
          || (index > 0 && point.distance <= profile[index - 1].distance))) {
        throw invariantFailure(`highway edge ${part.edge.id} has an incomplete elevation profile`);
      }
      const toRun = (distance: number): number => part.forward ? part.start + distance : part.end - distance;
      const toEdge = (distance: number): number => part.forward ? distance - part.start : part.end - distance;
      const conflict = profile.some((point) =>
        Math.abs(point.level - levelAt(envelope.elevationProfile, toRun(point.distance))) > PROFILE_EPSILON)
        || envelope.elevationProfile.some((point) => point.distance > part.start && point.distance < part.end
          && Math.abs(point.level - levelAt(profile, toEdge(point.distance))) > PROFILE_EPSILON);
      if (conflict) throw invariantFailure(`highway edge ${part.edge.id} elevation profile conflicts with its envelope`);
    }
  }
  return envelopes;
}
