# Generation measurements

2026-09-06, Node v24.20.0, blueprint 0.18.0, generator commit `76943ec`. Runs were sequential with a 25% quota of one CPU and a 10 ms quota period. All three completed successfully.

| Fixture | Wall time | Process CPU | Peak RSS | JSON |
| --- | ---: | ---: | ---: | ---: |
| 600 x 600 m, HTTP worker | 11.049 s | 2.744 s | 250.6 MiB | 5.09 MB |
| 1000 x 1000 m, public generator | 19.549 s | 4.865 s | 329.8 MiB | 14.03 MB |
| 2000 x 2000 m, public generator | 69.228 s | 17.247 s | 668.5 MiB | 68.52 MB |

The 600 m fixture uses seed `panel-review` with highways, trains and subways disabled. It submits through HTTP to the built worker, waits for 13/13 ready progress, fetches the saved blueprint and validates browser import. Its timing includes those operations.

The 1 km and 2 km fixtures use seed `urbe` and default features. Both include complete generation, all generation invariants, compact JSON serialization and a file write. The 1 km run also records a V8 CPU profile. They produce 49/256 blocks, 112/544 street edges and 311/1503 parcels respectively.

## Stage CPU time

| Work | 1 km | 2 km |
| --- | ---: | ---: |
| Direct street module layout | 0.082 s | 0.244 s |
| Building placement and early subway planning | 1.301 s | 3.091 s |
| Ground, supports and planning reservations | 2.434 s | 10.336 s |
| Crossings, signals and furniture | 0.162 s | 0.473 s |
| City validation | 0.639 s | 2.332 s |
| JSON serialization and file write | 0.150 s | 0.658 s |

Stage deltas come from `process.cpuUsage()` at the public progress callbacks. The largest sampled call tree is `StreetCorridors.reservations`: functional-band exports repeatedly union and subtract endpoint sweeps. The direct street layout is a small share of total work. The larger fixture has 5.2 times as many blocks and uses 3.5 times the total CPU time.

Tctl was sampled every 200 ms. Peak temperatures were 36.75 C (600 m), 35.875 C (1 km), and 36.875 C (2 km). These measurements apply to the quota-limited runs. Unrestricted wall time and temperatures, larger cities, hydrology and long-session memory retention are unmeasured. CPU time measures process work, not estimated unrestricted elapsed time.

## Reproduce

Use the built CLI from the measured revision:

```sh
systemd-run --user --scope --quiet -p CPUQuota=25% -p CPUQuotaPeriodSec=10ms timeout 100s /usr/bin/time -f 'wall=%e user=%U system=%S rssKiB=%M' node dist/cli.mjs --seed urbe --size 2000 --out /tmp/atlas-city.json
```

CLI process measurements also include module startup. Run one substantial geometry check at a time with an explicit timeout.

The built-worker cancellation check confirmed exit and record removal in 81 ms during stage 3 of a 3 km job. The deleted record returned HTTP 404.
