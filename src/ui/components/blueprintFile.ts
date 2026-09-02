/** Download the generated blueprint JSON without modifying it. */
import type { CityBlueprint } from '../../../schema/blueprint';

export function downloadBlueprint(blueprint: CityBlueprint): string {
  const seed = blueprint.meta.seed.replace(/[^a-z0-9_-]+/gi, '-');
  const filename = `atlas-blueprint-${seed}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
}
