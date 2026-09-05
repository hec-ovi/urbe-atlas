import type { District, StreetEdge } from '../../../schema/blueprint';
import type { StreetDomain } from '../domain/StreetDomain';

export interface AlleyNetwork {
  edges: readonly Pick<StreetEdge, 'class' | 'path'>[];
  domain: Pick<StreetDomain, 'covers'>;
}

export type AlleyDistrict = Pick<District, 'kind' | 'tier'>;
