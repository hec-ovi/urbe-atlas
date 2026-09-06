import type { PavingBandSetting, PavingModule } from './schema';

export function groupBaseOffset(module: PavingModule, grouping: NonNullable<PavingBandSetting['grouping']>): [number, number] {
  return [grouping.offset[0] % (module.baseCells?.[0] ?? 1), grouping.offset[1] % (module.baseCells?.[1] ?? 1)];
}

export function acceptsGroup(module: PavingModule, grouping: NonNullable<PavingBandSetting['grouping']>, column: number, row: number): boolean {
  const offset = groupBaseOffset(module, grouping);
  return [column, row].every((value, axis) => {
    const index = value * (module.baseCells?.[axis] ?? 1) + offset[axis] - grouping.offset[axis];
    return index % grouping.period[axis] === 0;
  });
}
