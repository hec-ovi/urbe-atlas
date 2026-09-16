import { invalidParams } from '../../../errors';
import type { ModuleFormat } from './schema';

export interface ModuleSizing {
  format: ModuleFormat;
  gutter: number;
  curb: number;
  separator: number;
  parkingDepth: 2 | 2.5;
}

const source: ModuleSizing = { format: 'source', gutter: 0.3, curb: 0.2, separator: 0, parkingDepth: 2.5 };
const district: ModuleSizing = { format: 'district', gutter: 0.5, curb: 0.2, separator: 0.2, parkingDepth: 2 };

export function moduleSizing(format: ModuleFormat = 'source'): Readonly<ModuleSizing> {
  if (format !== 'source' && format !== 'district') throw invalidParams('Unknown street module format', { format });
  return format === 'district' ? district : source;
}

export const moduleId = (id: string, sizing: Readonly<ModuleSizing>): string =>
  sizing.format === 'source' ? id : `${id}:${sizing.format}`;

/** Author shared dimensions on the millimetre grid before any placement. */
export const measure = (value: number): number => Math.round(value * 1000) / 1000;

/** Accept arithmetic roundoff at an authored grid coordinate, never a fractional grid cell. */
export const onGrid = (value: number, step: number): boolean => Number.isFinite(value)
  && Math.abs(value - Math.round(value / step) * step) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 4;
