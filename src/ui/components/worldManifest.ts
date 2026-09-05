export interface WorldManifest {
  contractVersion: '1.0.0';
  seed: string;
  atlasVersion: string;
  named: boolean;
  namingTheme: string | null;
  parcels: string[];
  interiors: string[];
  floors: Record<string, string[]>;
}

export function isWorldManifest(value: unknown): value is WorldManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  const fields = new Set(['contractVersion', 'seed', 'atlasVersion', 'named', 'namingTheme', 'parcels', 'interiors', 'floors', 'rooftopSpans']);
  if (Object.keys(manifest).some((key) => !fields.has(key))) return false;
  const strings = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) && candidate.every((item) => typeof item === 'string' && item.length > 0)
      && new Set(candidate).size === candidate.length;
  if (manifest.contractVersion !== '1.0.0'
    || typeof manifest.seed !== 'string' || manifest.seed.length === 0
    || typeof manifest.atlasVersion !== 'string' || manifest.atlasVersion.length === 0
    || typeof manifest.named !== 'boolean'
    || (manifest.namingTheme !== null && typeof manifest.namingTheme !== 'string')
    || !strings(manifest.parcels) || !strings(manifest.interiors)
    || !manifest.floors || typeof manifest.floors !== 'object' || Array.isArray(manifest.floors)) return false;
  const parcelIds = new Set(manifest.parcels);
  if (!manifest.interiors.every((id) => parcelIds.has(id))) return false;
  return Object.entries(manifest.floors).every(([parcelId, floors]) =>
    parcelIds.has(parcelId) && strings(floors) && floors.length > 0 && floors.every((floor) => /^-?[0-9]{3}$/.test(floor)));
}
