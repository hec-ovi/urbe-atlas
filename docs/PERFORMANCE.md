# Generation measurements

2026-09-05, Node v24.20.0. Measurements include complete city generation and its geometry invariants.

## Public 3 km profile

Source `519970b`, input `{seed: 'urbe', size: {width: 3000, depth: 3000}}`, all other defaults. The public CLI produces 1,772 street edges, 1,649 parcels and 9,276 ground polygons. CPU-profile and query-timer runs produce byte-identical output.

| Measurement | Result |
| --- | ---: |
| Public CLI, CPU sampling enabled | 36.51 s |
| Public generator, query timers enabled | 35.89 s |
| JSON serialization | 0.50 s |
| Process peak RSS | 948.7 MiB |
| Invariants, sampled time | 13.46 s |
| Planning reservation export, sampled time | 5.31 s |
| Compact blueprint | 62.28 MB |
| Planning reservations | 51.91 MB, 83.4% of output |

Three independent validation corridor builds consume 3.715 sampled seconds. One fresh validation-scoped snapshot could avoid about 2.46 seconds; this is an unimplemented estimate. Repeated complete export queries cost only 0.041 ms. Identical directed-radius sweep reuse needs its own measurement. Existing fixture budgets are unchanged pending that owning-box review.

## Fixture budget evidence

Local sequential public tests (`npm test -- --no-file-parallelism`) used for the scoped fixture budgets. The first release measurements predate exact planning-reservation publication; the paired alley measurement includes reserved domains and exact graph extensions.

| Fixture | Seconds |
| --- | ---: |
| `42`, 2 km, transit clearance | 7.80 |
| `urbe`, 3 km, transit clearance | 16.25 |
| `urbe`, 3 km, far-origin rectangle | 16.23 |
| `urbe`, 3 km, highway regeneration | 17.10 |
| `urbe`, 3 km, elevation profiles | 16.65 |
| `42`, two 2 km generations | 15.63 |
| `toggles`, 2 km | 6.44 |
| `floors`, 2 km | 6.90 |
| `urbe`, two 1.5 km district plans | 7.05 |
| 42 small-city seed/size pairs | 17.33 |
| `station-access`, 1.6 km, concurrent suite | 5.06 |
| `alleys`, two 1.2 km generations with reserved domains and exact extensions | 7.18 |

The release gate uses `npm test -- --maxWorkers=4` to bound concurrent city-generation workers. Fixture-specific budgets leave room for that full suite. Unit tests retain the default timeout. A budget change requires another complete measurement and an owning-box performance review; these timings are evidence, not output guarantees.
