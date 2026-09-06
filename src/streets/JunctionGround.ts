import type { GroundSource } from '../../schema/ground';
import type { JunctionGroundInput } from '../../schema/junction-ground';
import { invariantFailure } from '../errors';
import { GroundCover } from './GroundCover';
import { GroundSources, groundRoleSurface } from './GroundSources';
import { JunctionSource } from './JunctionSource';
import { JunctionReturns } from './JunctionReturns';
import { JunctionFitting } from './JunctionFitting';

/** Source-owned straight arms and physical returns share one retained partition. */
export class JunctionGround {
  static fitting(input: JunctionGroundInput) { return new JunctionFitting(new JunctionSource(input)).build(); }

  static build(input: JunctionGroundInput) { return GroundCover.snapshot(this.plan(input)); }

  static plan(input: JunctionGroundInput) {
    const source = new JunctionSource(input);
    const plan = GroundCover.plan({ format: 'source-claims-v1', boundary: input.datum.boundary,
      excluded: [], claims: [], remainder: input.remainder });
    const partition = plan.partition;
    const initial = plan.owners[0];
    if (!partition.covers(initial.ownerId, source.boundary)) {
      throw invariantFailure('junction return domain leaves available land', { contactId: input.contact.id, boundary: source.boundary });
    }
    const domain = `ground:contact:${input.contact.id}`;
    let outside = 'ground:straight:0';
    partition.divide(initial.ownerId, { claims: [{ id: domain, masks: [source.boundary] }], remainderId: outside });
    plan.owners = [];
    const register = (metadata: GroundSource, ownerId: string) => {
      const copy = GroundSources.copy(metadata);
      plan.sources.push(copy);
      plan.owners.push({ ownerId, sourceId: copy.id, surface: copy.surface, bottom: copy.bottom, top: copy.top });
    };
    const straight = [
      ...input.datum.grade.roadway.map(row => {
        const span = input.datum.spans.find(span => span.id === row.spanId)!;
        return { masks: row.polygons, source: { id: `road:${row.spanId}`, kind: 'roadway' as const, edgeId: span.edgeId,
          spanIds: [row.spanId], surface: 'roadway' as const, bottom: input.bottom, top: input.roadwayTop } };
      }),
      ...input.datum.grade.sideBands!.map(row => ({ masks: row.masks,
        source: { id: `side:${row.edgeId}:${row.side}:${row.role}`, kind: 'side-band' as const, edgeId: row.edgeId,
          spanIds: row.spanIds, side: row.side, role: row.role, surface: groundRoleSurface(row.role)!, bottom: input.bottom, top: row.top } })),
    ].sort((a, b) => a.source.id.localeCompare(b.source.id));
    for (const [index, claim] of straight.entries()) {
      const next = `ground:straight:${index + 1}`, ownerId = `ground:source:${claim.source.id}`;
      partition.divide(outside, { claims: [{ id: ownerId, masks: claim.masks }], remainderId: next });
      register(claim.source as GroundSource, ownerId);
      outside = next;
    }
    plan.owners.push({ ...initial, ownerId: outside });
    const returns = new JunctionReturns(source);
    let available = domain;
    const roles = [{ role: 'roadway' as const, end: 0, top: 0 }, ...source.geometry.intervals];
    for (const [index, interval] of roles.entries()) {
      const id = `junction:${input.contact.id}:${interval.role}`, next = `${domain}:remaining:${index}`;
      const ownerId = `ground:source:${id}`;
      partition.divide(available, { claims: [{ id: ownerId, ...returns.at(interval.end) }], remainderId: next });
      register({ id, kind: 'junction', contactId: input.contact.id, role: interval.role, surface: groundRoleSurface(interval.role)!,
        bottom: input.bottom, top: input.roadwayTop + interval.top,
        contributors: [...input.contact.arms].sort((a, b) => a.edgeId.localeCompare(b.edgeId)).map(arm => ({
          groupId: arm.groupId, nodeId: arm.nodeId, edgeId: arm.edgeId, end: arm.end,
          ...source.handoffs.get(arm.edgeId)!,
          spanIds: source.spans(arm.edgeId).map(span => span.id), sides: interval.role === 'roadway' ? [] : ['left', 'right'],
        })) }, ownerId);
      available = next;
    }
    plan.owners.push({ ...initial, ownerId: available });
    GroundSources.table(plan.sources);
    return plan;
  }
}
