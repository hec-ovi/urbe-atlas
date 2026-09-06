# Generation measurements

2026-09-06, Node v24.20.0, local Linux host. Public `generateCity({seed: "urbe"})`, default 1000 x 1000 m, includes buildings, transit, all generation invariants and JSON serialization.

| Measurement | Result |
| --- | ---: |
| CPU time | 6.814 s |
| Wall time with 25% CPU quota | 27.407 s |
| Peak process RSS | 306.2 MiB |
| Blueprint JSON | 14.03 MB |
| Blocks / street edges / parcels | 49 / 112 / 311 |
| CPU Tctl before / peak / after | 38.25 / 38.5 / 38.0 C |

The quota was 25% of one CPU with a 10 ms quota period. Temperature was sampled every 200 ms. This is one completed fixture, not an unrestricted-temperature measurement or a guarantee for other sizes and seeds. CPU time is process work, not an estimated wall time.

Reproduce the public CLI after `npm run build:cli`:

```sh
systemd-run --user --scope --quiet -p CPUQuota=25% -p CPUQuotaPeriodSec=10ms timeout 45s node dist/cli.mjs --seed urbe --out /tmp/atlas-city.json
```

A second built-worker run through the city HTTP API, seed `panel-review`, 600 x 600 m with highways/trains/subways off, completed with 114 parcels in 12.156 s wall and 3.009 s process CPU under the same quota. Progress reached 13/13 after serialization and persistence. Cancelling a 3 km job during stage 3 confirmed worker exit and record removal in 81 ms.

Run one substantial geometry check at a time. Scoped contract checks use the same CPU quota and an explicit timeout.
