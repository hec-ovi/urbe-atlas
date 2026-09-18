/**
 * Every number the blueprint publishes sits on the millimetre grid the contract
 * states. Float arithmetic drifts a few attometres off it (41.400000000000006),
 * which costs bytes in the JSON and nothing else, so the finished plan is
 * rounded back onto the grid before it is validated and returned.
 */
export function snapToMillimetres<T>(value: T): T {
  walk(value as unknown);
  return value;
}

function walk(value: unknown): void {
  if (Array.isArray(value) && !Object.isFrozen(value)) {
    for (let i = 0; i < value.length; i++) {
      const entry = value[i];
      if (typeof entry !== 'number') walk(entry);
      else if (entry !== round(entry)) value[i] = round(entry);
    }
    return;
  }
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const entry = record[key];
    if (typeof entry !== 'number') walk(entry);
    else if (entry !== round(entry)) record[key] = round(entry);
  }
}

function round(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return value;
  return Math.round(value * 1000) / 1000;
}
