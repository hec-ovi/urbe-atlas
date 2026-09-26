/**
 * Generate a blueprint from the command line.
 * npm run generate -- --seed urbe --out samples/city-urbe.json [--size 3000]
 * [--max-floors 40] [--district-count 4,8] [--hydrology river] [--no-highways] [--no-subways] [--no-alleys]
 */
import { writeFileSync } from 'node:fs';
import { generateCity } from './index';
import { AtlasError } from './errors';
import type { HydrologyType } from '../schema/params';

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const seed = opt('seed');
const out = opt('out');
if (!seed || !out) {
  console.error('usage: --seed <seed> --out <file.json> [--size N] [--max-floors N] [--district-count MIN,MAX] [--hydrology lagoon|river|sea-coast] [--no-highways] [--no-subways] [--no-alleys]');
  process.exit(2);
}

try {
  const size = opt('size') ? Number(opt('size')) : undefined;
  const districts = opt('district-count');
  const hydrology = opt('hydrology');
  const t0 = performance.now();
  const bp = generateCity({
    seed,
    ...(size !== undefined ? { size: { width: size, depth: size } } : {}),
    ...(opt('max-floors') !== undefined ? { maxFloors: Number(opt('max-floors')) } : {}),
    ...(districts !== undefined ? { districtCount: districts.split(',').map(Number) as [number, number] } : {}),
    ...(hydrology !== undefined ? { hydrology: { type: hydrology as HydrologyType } } : {}),
    features: {
      highways: !flag('no-highways'),
      subways: !flag('no-subways'),
      alleys: !flag('no-alleys'),
    },
  });
  const json = JSON.stringify(bp);
  writeFileSync(out, json);
  console.log(
    `${out}: seed ${bp.meta.seed}, ${Math.round(performance.now() - t0)} ms, ` +
      `${bp.parcels.length} parcels, ${bp.blocks.length} blocks, ${bp.meta.blockTemplates?.length ?? 0} templates, ` +
      `${bp.districts.length} districts, pop ${bp.stats.population}, ${(json.length / 1e6).toFixed(2)} MB`,
  );
} catch (e) {
  if (e instanceof AtlasError) {
    console.error(`${e.code}: ${e.message}`);
    process.exit(1);
  }
  throw e;
}
