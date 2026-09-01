/**
 * Generate a blueprint from the command line.
 * npm run generate -- --seed urbe --out samples/city-urbe.json [--size 3000]
 * [--irregularity 0.6] [--max-floors 40] [--no-highways] [--no-trains] [--no-subways]
 */
import { writeFileSync } from 'node:fs';
import { generateCity } from './index';
import { AtlasError } from './errors';

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
  console.error('usage: --seed <seed> --out <file.json> [--size N] [--irregularity X] [--max-floors N] [--no-highways] [--no-trains] [--no-subways]');
  process.exit(2);
}

try {
  const size = opt('size') ? Number(opt('size')) : undefined;
  const t0 = performance.now();
  const bp = generateCity({
    seed,
    ...(size !== undefined ? { size: { width: size, depth: size } } : {}),
    ...(opt('irregularity') !== undefined ? { irregularity: Number(opt('irregularity')) } : {}),
    ...(opt('max-floors') !== undefined ? { maxFloors: Number(opt('max-floors')) } : {}),
    features: { highways: !flag('no-highways'), trains: !flag('no-trains'), subways: !flag('no-subways') },
  });
  writeFileSync(out, JSON.stringify(bp));
  console.log(
    `${out}: seed ${bp.meta.seed}, ${Math.round(performance.now() - t0)} ms, ` +
      `${bp.parcels.length} parcels, ${bp.districts.length} districts, pop ${bp.stats.population}`,
  );
} catch (e) {
  if (e instanceof AtlasError) {
    console.error(`${e.code}: ${e.message}`);
    process.exit(1);
  }
  throw e;
}
