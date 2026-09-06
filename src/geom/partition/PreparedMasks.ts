import { invariantFailure } from '../../errors';
import { PointPool } from './Exact';
import { readRing } from './RingInput';
import { WindingField } from './WindingField';
import type { PartitionMaskInput, PreparedPartitionMasks } from './schema';

const fields = new WeakMap<PreparedPartitionMasks, WindingField>();

/** Validates a mask snapshot once; its handle retains no query results. */
export function prepareMasks(input: PartitionMaskInput): PreparedPartitionMasks {
  const pool = new PointPool().reader(input.encoding);
  const field = new WindingField(input.masks.map(mask => readRing(mask, pool)), true);
  const handle = Object.freeze({}) as PreparedPartitionMasks;
  fields.set(handle, field);
  return handle;
}

export function readPreparedMasks(handle: PreparedPartitionMasks): WindingField {
  const field = fields.get(handle);
  if (!field) throw invariantFailure('partition prepared masks are unknown');
  return field;
}
