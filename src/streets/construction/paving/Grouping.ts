import type { PavingBandSetting, PavingModule } from './schema';

export function acceptsGroup(module: PavingModule, grouping: NonNullable<PavingBandSetting['grouping']>, column: number, row: number): boolean {
  return [column, row].every((value, axis) => {
    const index = value * (module.baseCells?.[axis] ?? 1) - grouping.offset[axis];
    return index % grouping.period[axis] === 0;
  });
}
