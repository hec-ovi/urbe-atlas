import { parentPort, workerData } from 'node:worker_threads';
import { generateCity } from '../index';
import { generationError } from './errors';
import type { AtlasParams } from '../../schema/params';

try {
  const blueprint = generateCity(workerData as AtlasParams, progress => parentPort!.postMessage({ progress }));
  parentPort!.postMessage({ result: { json: JSON.stringify(blueprint), stats: blueprint.stats } });
} catch (error) {
  parentPort!.postMessage({ error: generationError(error) });
}
