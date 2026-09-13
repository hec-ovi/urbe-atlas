/** The movement plan over a finished street graph. */
import { ARCHITECTURE_VERSION, type Architecture, type CrossingLink, type SignalGroup } from '../../schema/architecture';
import type { StreetGraph } from '../../schema/blueprint';
import { Crossings } from './Crossings';
import { Lanes } from './Lanes';
import type { PlannedEdge } from './PlannedEdge';
import { Ramps } from './Ramps';
import { Signals } from './Signals';
import { Turns } from './Turns';
import { Walkways } from './Walkways';

export function planArchitecture(streets: Pick<StreetGraph, 'nodes' | 'edges' | 'highwayStructures'>): Architecture {
  const planned = new Map<string, PlannedEdge>();
  for (const edge of streets.edges) {
    const reservation = Walkways.reservation(edge);
    planned.set(edge.id, { ...edge, reservation, lanes: Lanes.of(edge), walkingLanes: Walkways.of({ ...edge, reservation }) });
  }
  const crossings: CrossingLink[] = [];
  const signalGroups: SignalGroup[] = [];
  for (const node of streets.nodes) {
    const here = Crossings.of(node, planned);
    signalGroups.push(...Signals.of(node, planned, here));
    crossings.push(...here);
  }
  return {
    version: ARCHITECTURE_VERSION,
    edges: [...planned.values()].map(({ id, reservation, lanes, walkingLanes }) => ({ edgeId: id, reservation, lanes, walkingLanes })),
    nodes: streets.nodes.map(node => ({ nodeId: node.id, turns: Turns.of(node.id, node.connections, planned) })),
    crossings,
    signalGroups,
    ramps: Ramps.of(streets.highwayStructures, planned),
  };
}
