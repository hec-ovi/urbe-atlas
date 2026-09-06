/** Nested path get/set for form values. Paths use dots; array indexes are numeric segments. */

export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const key of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function setPath(source: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = source;
  for (let index = 0; index < keys.length - 1; index++) {
    const key = keys[index]!;
    const nextKey = keys[index + 1]!;
    const existing = current[key];
    if (existing === null || typeof existing !== 'object') {
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

export function deletePath(source: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  const parents: Record<string, unknown>[] = [source];
  let current: unknown = source;
  for (let index = 0; index < keys.length - 1; index++) {
    if (current === null || typeof current !== 'object') return;
    current = (current as Record<string, unknown>)[keys[index]!];
    parents.push(current as Record<string, unknown>);
  }
  if (current === null || typeof current !== 'object') return;
  delete (current as Record<string, unknown>)[keys[keys.length - 1]!];
  for (let index = keys.length - 1; index > 0; index--) {
    const object = parents[index];
    if (!object || typeof object !== 'object' || Object.keys(object).length > 0) return;
    delete parents[index - 1]![keys[index - 1]!];
  }
}
