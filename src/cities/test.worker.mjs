import { existsSync, writeFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

// A CPU-bound worker held until the HTTP test creates its release file.
writeFileSync(`${workerData.seed}.started`, 'running');
while (!existsSync(workerData.seed)) { /* stay in the worker */ }
parentPort.postMessage({ result: { json: '{"worker":true}', stats: { population: 0, parcelCounts: {}, perDistrict: [] } } });
