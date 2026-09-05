/**
 * Assigns parcel types, tiers and envelopes: base type from the district
 * kind among the types the lot's band can host, then facility quotas (ceil
 * of population / residents-per-facility) replace scored parcels so
 * hospitals, police, commerce land where they make sense.
 */
import type { Envelope, ParcelType, Vec2 } from '../../schema/blueprint';
import type { DistrictKind, WealthTier } from '../../schema/params';
import type { Rng } from '../core/rng';
import type { PlannedDistrict } from '../districts/DistrictPlanner';
import { area, centroid } from '../geom/polygon';
import { dist } from '../geom/vec';
import { isHeavy } from './bands';
import { makeEnvelope } from './envelopes';
import { lotHosts } from './profiles';
import type { FootprintHost } from './FootprintHost';
import { BASE_MIX } from './UseMix';
import { parcelTier } from './TierPolicy';
import { residentialCapacity } from './ResidentialCapacity';
import { populationForecast } from './PopulationForecast';
import type { DistrictCapacityInput, PopulationForecast } from './population-schema';
import {
  ANCHOR_FACILITIES,
  MIN_FACILITY_AREA,
  RESIDENTS_PER_FACILITY,
} from './ratios';

export interface ZonedParcel {
  lotIndex: number;
  type: ParcelType;
  tier: WealthTier;
  envelope: Envelope;
  /** Estimated residents (residential parcels only). */
  residents: number;
}

export interface LotInput {
  polygon: readonly Vec2[];
  districtIndex: number;
  /** True when the lot touches a road-class edge. */
  onRoad: boolean;
}

export class Zoning {
  static populationForecast(districts: readonly DistrictCapacityInput[]): PopulationForecast {
    return populationForecast(districts);
  }

  static assign(lots: LotInput[], districts: PlannedDistrict[], cityCenter: Vec2, rng: Rng, host: FootprintHost): ZonedParcel[] {
    // --- base types from the district mix, limited to what the lot hosts ---
    const hosts = (index: number, type: ParcelType): boolean => lotHosts(lots[index].polygon as Vec2[], type, host);
    const parcels: ZonedParcel[] = lots.map((lot, lotIndex) => {
      const district = districts[lot.districtIndex];
      const mix = BASE_MIX[district.kind].filter(([t]) => hosts(lotIndex, t));
      const pool: [ParcelType, number][] = mix.length > 0 ? mix : [[Zoning.fallbackType(district.kind), 1]];
      const type = pool[rng.weighted(pool.map((m) => m[1]))][0];
      const tier = parcelTier(district.tier, district.kind, rng);
      return { lotIndex, type, tier, envelope: makeEnvelope(type, tier, district.maxFloors, rng), residents: 0 };
    });

    // --- provisional population from residential capacity ----------------
    const population = Math.max(1, Math.round(totalResidents(parcels, lots)));

    // --- facility quotas -------------------------------------------------
    const centroids = lots.map((l) => centroid(l.polygon as Vec2[]));
    const areas = lots.map((l) => area(l.polygon as Vec2[]));
    const maxD = Math.max(...centroids.map((c) => dist(c, cityCenter)), 1);
    const facilityTypes = Object.keys(RESIDENTS_PER_FACILITY) as ParcelType[];
    const taken = new Set<number>();

    for (const facility of facilityTypes) {
      const ratio = RESIDENTS_PER_FACILITY[facility]!;
      const target = facility === 'military' ? Math.floor(population / ratio) : Math.max(1, Math.ceil(population / ratio));
      const existing = parcels.filter((p) => p.type === facility).length;
      const quota = Math.max(0, target - existing);
      const minArea = MIN_FACILITY_AREA[facility] ?? 0;
      const anchor = ANCHOR_FACILITIES.includes(facility);
      const candidates = parcels
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => {
          if (taken.has(i)) return false;
          if (areas[i] < minArea || !hosts(i, facility)) return false;
          const kind = districts[lots[i].districtIndex].kind;
          if (facility === 'factory') return kind === 'industrial';
          if (anchor && kind === 'industrial' && facility !== 'military') return false;
          return p.type === 'residential' || p.type === 'commerce' || p.type === 'offices';
        })
        .map(({ i }) => {
          const centrality = 1 - dist(centroids[i], cityCenter) / maxD;
          const road = lots[i].onRoad ? 1 : 0;
          const size = Math.min(areas[i] / (minArea || 500), 3);
          const score = anchor ? road * 2 + size + centrality : road * 0.5 + centrality * 0.3 + rng.next();
          return { i, score };
        })
        .sort((a, b) => b.score - a.score || a.i - b.i);

      // spread anchors across districts before doubling up in one
      const usedDistricts = new Set<number>();
      let placed = 0;
      for (const { i } of candidates) {
        if (placed >= quota) break;
        const di = lots[i].districtIndex;
        if (anchor && usedDistricts.has(di) && usedDistricts.size < new Set(lots.map((l) => l.districtIndex)).size) {
          continue;
        }
        taken.add(i);
        usedDistricts.add(di);
        const district = districts[di];
        parcels[i] = {
          lotIndex: i,
          type: facility,
          tier: parcels[i].tier,
          envelope: makeEnvelope(facility, parcels[i].tier, district.maxFloors, rng),
          residents: 0,
        };
        placed++;
      }
    }

    // --- final residents per residential parcel --------------------------
    for (const p of parcels) {
      if (p.type !== 'residential') continue;
      p.residents = Zoning.residentsFor(areas[p.lotIndex], p.envelope);
    }
    return parcels;
  }

  /** Light type a heavy parcel falls to when its footprint cannot host the heavy band: the district's main light use. */
  static fallbackType(kind: DistrictKind): ParcelType {
    const light = BASE_MIX[kind].filter(([t]) => !isHeavy(t));
    return light.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
  }

  /** The same lot rezoned to its district's fallback type, tier kept, envelope redrawn. */
  static retype(parcel: ZonedParcel, district: PlannedDistrict, rng: Rng): ZonedParcel {
    const type = Zoning.fallbackType(district.kind);
    return { ...parcel, type, envelope: makeEnvelope(type, parcel.tier, district.maxFloors, rng), residents: 0 };
  }

  /** Capacity model: lot coverage 0.55, average floors, usable share, m2 per resident. */
  static residentsFor(lotArea: number, envelope: Envelope): number {
    const avgFloors = (envelope.minFloors + envelope.maxFloors) / 2;
    return Math.round(residentialCapacity(lotArea, avgFloors));
  }
}

function totalResidents(parcels: ZonedParcel[], lots: LotInput[]): number {
  let sum = 0;
  for (const p of parcels) {
    if (p.type !== 'residential') continue;
    const avgFloors = (p.envelope.minFloors + p.envelope.maxFloors) / 2;
    sum += residentialCapacity(area(lots[p.lotIndex].polygon as Vec2[]), avgFloors);
  }
  return sum;
}
