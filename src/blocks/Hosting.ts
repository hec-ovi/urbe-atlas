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
import { coreFit } from '../zoning/core';

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

export function hostFootprint(lot: Polygon, profile: HostingProfile): HostedFootprint | null {
  const inset = offset([lot], -profile.setback).sort((a, b) => area(b) - area(a))[0];
  if (!inset) return null;
  const footprint = trimToBand(inset, profile.band);
  if (!footprint || area(footprint) < profile.keep * area(inset)) return null;
  const fit = coreFit(footprint);
  if (fit.floorCap === 0 || (profile.heavy && !fit.compact)) return null;
  return { footprint, floorCap: fit.floorCap };
}
