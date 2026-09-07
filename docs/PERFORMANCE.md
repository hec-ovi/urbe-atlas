# Generation measurements

2026-09-06, Node v24.20.0, blueprint 0.19.0, generator commit `c541ecc`. Both built HTTP worker runs completed with seed `urbe` and default features. Runs were sequential at 25% of one CPU, with a 10 ms quota period.

| City size | Wall time | Process CPU | Peak RSS | JSON | Peak Tctl |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1000 x 1000 m | 28.880 s | 7.181 s | 391.7 MiB | 15.56 MB | 48.1 C |
| 2000 x 2000 m | 95.469 s | 23.585 s | 1031.6 MiB | 75.73 MB | 60.5 C |

Timing includes HTTP submission, worker generation and its invariants, persistence, saved blueprint download and browser input validation. Both reached 13/13 ready progress. CPU time measures process work, not estimated unrestricted elapsed time. Tctl was sampled every 200 ms; temperatures apply to these quota-limited runs.

The 1 km result has 49 blocks, 306 parcels, two street cuts (30 and 45 degrees), 9 parking bays, 23 short rail groups across 20 blocks and 54 trees across 38 street segments. Seven blocks have a width/depth ratio of at least 1.5. The 2 km result has 256 blocks, 1503 parcels and 12 declared-angle cuts.

These fixtures verify completion at two sizes. Other seeds, larger cities, hydrology, unrestricted wall time and temperatures, and long-session memory retention are unmeasured by this check.

## Reproduce

Use the built CLI from the measured revision:

```sh
systemd-run --user --scope --quiet -p CPUQuota=25% -p CPUQuotaPeriodSec=10ms timeout 130s /usr/bin/time -f 'wall=%e user=%U system=%S rssKiB=%M' node dist/cli.mjs --seed urbe --size 2000 --out /tmp/atlas-city.json
```

CLI process measurements include module startup and omit HTTP download/browser validation. Run one substantial geometry check at a time with an explicit timeout.

The city service's worker cancellation check confirmed exit and record removal in 81 ms during stage 3 of a 3 km job. The deleted record returned HTTP 404.
