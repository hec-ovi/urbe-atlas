import type { GroundSource } from '../../schema/ground';
import { invariantFailure } from '../errors';

const pavedRoles = new Set(['border', 'furnishing', 'walking', 'frontage']);

export const groundRoleSurface = (role: string) => pavedRoles.has(role) ? 'sidewalk' as const
  : role === 'roadway' || role === 'curb' || role === 'gutter' || role === 'gutter-lip' ? role : undefined;

/** Validated copies contain provenance and levels only, never source geometry. */
export class GroundSources {
  static copy(source: GroundSource): GroundSource {
    const invalid = (): never => { throw invariantFailure('ground source metadata is invalid', { sourceId: source?.id }); };
    const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
    if (!source || !text(source.id) || !Number.isFinite(source.bottom) || !Number.isFinite(source.top)
      || source.bottom > source.top) return invalid();
    const levels = { id: source.id, bottom: source.bottom, top: source.top };
    if (source.kind === 'junction') {
      const uniqueText = (values: unknown): values is string[] => Array.isArray(values)
        && values.length > 0 && values.every(text) && new Set(values).size === values.length;
      if (!text(source.contactId) || source.surface !== groundRoleSurface(source.role)
        || groundRoleSurface(source.role) === undefined || !Array.isArray(source.contributors) || !source.contributors.length) return invalid();
      const keys = new Set<string>();
      const contributors = source.contributors.map(row => {
        if (!row || !text(row.groupId) || !text(row.nodeId) || !text(row.edgeId) || !text(row.runId)
          || !Number.isFinite(row.runStation) || row.runStation < 0 || !Number.isFinite(row.distance) || row.distance < 0
          || !['from', 'to'].includes(row.end) || !uniqueText(row.spanIds) || !Array.isArray(row.sides)
          || new Set(row.sides).size !== row.sides.length || row.sides.some(side => side !== 'left' && side !== 'right')
          || (source.role === 'roadway' ? row.sides.length !== 0 : row.sides.length === 0)) return invalid();
        const key = JSON.stringify([row.groupId, row.edgeId, row.end]);
        if (keys.has(key)) return invalid();
        keys.add(key);
        return { groupId: row.groupId, nodeId: row.nodeId, edgeId: row.edgeId, end: row.end,
          runId: row.runId, runStation: row.runStation, distance: row.distance,
          spanIds: [...row.spanIds], sides: [...row.sides] };
      });
      return { ...levels, kind: 'junction', contactId: source.contactId, role: source.role, surface: source.surface, contributors };
    }
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
    const surface = groundRoleSurface(source.role);
    if ((source.side !== 'left' && source.side !== 'right') || surface === undefined || surface === 'roadway' || source.surface !== surface) return invalid();
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
