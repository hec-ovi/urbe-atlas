/**
 * Footprint a lot offers a hosting profile: the lot inset by the setback,
 * trimmed to the band the profile needs end to end while keeping the
 * profile's share of the inset, and hosting a core the profile accepts.
 * Null when the lot cannot host the profile.
 */
import type { Polygon } from '../../schema/blueprint';
import { trimToBand } from '../geom/band';
import { offset } from '../geom/clip';
import { area } from '../geom/polygon';
import { coreFit } from './core';
import type { FootprintPolicy } from './FootprintPolicy';
import { RectangularFootprint } from './RectangularFootprint';
import { GridFrame } from './GridFrame';
import { compareCandidates } from './RectangleCandidates';

export interface HostingProfile {
  /** Distance from the lot line to the buildable footprint, meters. */
  setback: number;
  /** Band the footprint keeps end to end, meters. */
  band: number;
  /** Needs the compact elevator core; a light profile builds on any core. */
  heavy: boolean;
  /** Share of the inset the trimmed footprint must keep, 0 to 1. */
  keep: number;
}

export interface HostedFootprint {
  footprint: Polygon;
  /** Floors the hosted core allows, Infinity with an elevator core. */
  floorCap: number;
}

/** One city run shares exact eligibility results with final parcel construction. */
export class FootprintHost {
  private readonly cache = new WeakMap<Polygon, Map<string, HostedFootprint | null>>();

  constructor(private readonly policy: FootprintPolicy) {}

  fit(lot: Polygon, profile: HostingProfile): HostedFootprint | null {
    let entries = this.cache.get(lot);
    if (!entries) { entries = new Map(); this.cache.set(lot, entries); }
    const key = `${profile.setback}:${profile.band}:${profile.heavy}:${profile.keep}`;
    if (!entries.has(key)) entries.set(key, hostFootprint(lot, profile, this.policy));
    return entries.get(key)!;
  }
}

function hostFootprint(lot: Polygon, profile: HostingProfile, policy: FootprintPolicy): HostedFootprint | null {
  const pieces = offset([lot], -profile.setback).sort((a, b) => area(b) - area(a));
  const minimumArea = profile.keep * pieces.reduce((sum, piece) => sum + area(piece), 0);
  const frame = policy.shape === 'rectangle' ? new GridFrame(policy.grid) : null;
  let best: HostedFootprint | null = null;
  for (const inset of pieces) {
    const footprint = policy.shape === 'rectangle'
      ? RectangularFootprint.fit(inset, profile, policy.grid)
      : trimToBand(inset, profile.band);
    if (!footprint || area(footprint) < minimumArea) continue;
    const fit = coreFit(footprint);
    if (fit.floorCap === 0 || (profile.heavy && !fit.compact)) continue;
    const preferred = !best || (frame
      ? compareCandidates(frame.candidate(footprint), frame.candidate(best.footprint)) < 0
      : area(footprint) > area(best.footprint));
    if (preferred) best = { footprint, floorCap: fit.floorCap };
  }
  return best;
}
