# Generation measurements

2026-09-05, Node v24.20.0, local sequential public tests (`npm test -- --no-file-parallelism`). These measure complete city fixtures, including geometry invariants and the named test assertions.

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

The release gate uses `npm test -- --maxWorkers=4` to bound concurrent city-generation workers. Fixture-specific budgets leave room for that full suite. Unit tests retain the default timeout. A budget change requires another complete measurement and an owning-box performance review; these timings are evidence, not output guarantees.
