import type { GroundSource } from '../../schema/ground';
import { invariantFailure } from '../errors';

const pavedRoles = new Set(['border', 'furnishing', 'walking', 'frontage']);

/** Validated copies contain provenance and levels only, never source geometry. */
export class GroundSources {
  static copy(source: GroundSource): GroundSource {
    const invalid = (): never => { throw invariantFailure('ground source metadata is invalid', { sourceId: source?.id }); };
    const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
    if (!source || !text(source.id) || !Number.isFinite(source.bottom) || !Number.isFinite(source.top)
      || source.bottom > source.top) return invalid();
    const levels = { id: source.id, bottom: source.bottom, top: source.top };
    if (source.kind === 'land') {
      if (!text(source.landId) || !['sidewalk', 'block', 'open'].includes(source.surface)) return invalid();
      return { ...levels, kind: source.kind, landId: source.landId, surface: source.surface };
    }
    if ((source.kind !== 'roadway' && source.kind !== 'side-band') || !text(source.edgeId)
      || !Array.isArray(source.spanIds) || source.spanIds.length === 0
      || !source.spanIds.every(text) || new Set(source.spanIds).size !== source.spanIds.length) return invalid();
    const street = { ...levels, edgeId: source.edgeId, spanIds: [...source.spanIds] };
    if (source.kind === 'roadway') {
      if (source.surface !== 'roadway') return invalid();
      return { ...street, kind: source.kind, surface: source.surface };
    }
    const surface = pavedRoles.has(source.role) ? 'sidewalk'
      : ['curb', 'gutter', 'gutter-lip'].includes(source.role) ? source.role : undefined;
    if ((source.side !== 'left' && source.side !== 'right') || source.surface !== surface || surface === undefined) return invalid();
    return { ...street, kind: source.kind, side: source.side, role: source.role, surface: source.surface };
  }

  static table(sources: GroundSource[]): GroundSource[] {
    if (!Array.isArray(sources)) throw invariantFailure('ground source table is invalid');
    const ids = new Set<string>();
    return sources.map(source => {
      const copy = this.copy(source);
      if (ids.has(copy.id)) throw invariantFailure('ground source ID is repeated', { sourceId: copy.id });
      ids.add(copy.id);
      return copy;
    });
  }
}
