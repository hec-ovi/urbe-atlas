import type { CityBlueprint, Envelope, ParcelType } from '../../schema/blueprint';
import { invalidParams, invariantFailure } from '../errors';
import { resolveParams } from '../params/defaults';
import type { LandmarkFloors } from './schema';
import { validateLandmarkFloors } from './validate';

const TYPES = new Set<ParcelType>(['corpo', 'offices', 'hotel']);

export function applyLandmarkFloors(blueprint: CityBlueprint, input: LandmarkFloors): CityBlueprint {
  const floors = validateLandmarkFloors(input);
  const parcels = new Map(blueprint.parcels.map(parcel => [parcel.id, parcel]));
  const districts = new Map(blueprint.districts.map(district => [district.id, district]));
  const volumes = new Set(blueprint.volumetric.buildings.map(building => building.parcelId));
  const envelopes = new Map<string, Envelope>();

  for (const [parcelId, count] of Object.entries(floors)) {
    const details = { field: 'landmarkFloors', parcelId };
    const parcel = parcels.get(parcelId);
    if (!parcel) throw invalidParams(`landmarkFloors references unknown parcel ${parcelId}`, details);
    if (!TYPES.has(parcel.type) || parcel.envelope.maxFloors <= 6) {
      throw invalidParams(`landmarkFloors.${parcelId} requires an elevator-hosted corpo, offices or hotel parcel`, details);
    }
    const district = districts.get(parcel.districtId);
    if (!district || !volumes.has(parcelId)) {
      throw invariantFailure(`landmark parcel ${parcelId} requires its district and planning prism`, details);
    }
    if (count > district.maxFloors) {
      throw invalidParams(`landmarkFloors.${parcelId} exceeds district cap ${district.maxFloors}`, details);
    }
    envelopes.set(parcelId, {
      ...parcel.envelope,
      minFloors: count,
      maxFloors: count,
      maxHeight: Math.round(count * parcel.envelope.floorHeight * 100) / 100,
    });
  }

  return {
    ...blueprint,
    meta: {
      ...blueprint.meta,
      params: resolveParams({
        ...blueprint.meta.params,
        landmarkFloors: { ...blueprint.meta.params.landmarkFloors, ...floors },
      }),
    },
    parcels: blueprint.parcels.map(parcel => {
      const envelope = envelopes.get(parcel.id);
      return envelope ? { ...parcel, envelope } : parcel;
    }),
    volumetric: {
      ...blueprint.volumetric,
      buildings: blueprint.volumetric.buildings.map(building => {
        const envelope = envelopes.get(building.parcelId);
        return envelope ? { ...building, height: envelope.maxHeight } : building;
      }),
    },
  };
}
