import { existsSync, writeFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

parentPort.postMessage({ progress: { completed: 3, total: 13, phase: 'Constructing street surfaces' } });

// A CPU-bound worker held until the HTTP test creates its release file.
writeFileSync(`${workerData.seed}.started`, 'running');
while (!existsSync(workerData.seed)) { /* stay in the worker */ }
writeFileSync(`${workerData.seed}.finished`, 'done');
parentPort.postMessage({ result: { json: '{"worker":true}', stats: { population: 0, parcelCounts: {}, perDistrict: [] } } });
