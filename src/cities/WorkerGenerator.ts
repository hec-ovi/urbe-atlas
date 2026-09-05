import { Worker } from 'node:worker_threads';
import { interruptedError } from './errors';
import type { AtlasParams } from '../../schema/params';
import type { CityError, GeneratedCity } from './schema';

export class WorkerGenerator {
  constructor(private readonly workerUrl: URL) {}

  generate(params: AtlasParams, signal: AbortSignal): Promise<GeneratedCity> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(interruptedError());
      const worker = new Worker(this.workerUrl, { workerData: params });
      const abort = () => { void worker.terminate(); };
      signal.addEventListener('abort', abort, { once: true });
      worker.once('message', (message: { result?: GeneratedCity; error?: CityError }) => {
        if (message.result) resolve(message.result);
        else reject(message.error ?? new Error('The generation worker returned no blueprint.'));
      });
      worker.once('error', reject);
      worker.once('exit', code => {
        signal.removeEventListener('abort', abort);
        reject(signal.aborted ? interruptedError() : new Error(`The generation worker exited (${code}) without a result.`));
      });
    });
  }
}
