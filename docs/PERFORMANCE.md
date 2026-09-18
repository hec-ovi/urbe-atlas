# Generation measurements

Blueprint 0.26.0, package 0.12.1. Sample files in `samples/` at this version:

| City | Seed | JSON | Blocks | Parcels | Templates |
| --- | --- | ---: | ---: | ---: | ---: |
| 400 x 400 m | `urbe-tiny` | 0.42 MB | 9 | 47 | 2 |
| 1000 x 1000 m | `urbe` | 2.54 MB | 64 | 431 | 8 |

The default 3000 x 3000 m city writes 9.3 MB. Generation reports twelve pipeline stages (`GENERATION_STAGES` in `schema/progress.ts`). Delete on a running job terminates the worker and removes the catalog record.

## Reproduce

Use the built CLI on a sample size:

```sh
timeout 60s /usr/bin/time -f 'wall=%e user=%U system=%S rssKiB=%M' node dist/cli.mjs --seed urbe --size 1000 --out /tmp/atlas-city.json
```

CLI process measurements include module startup. Run one generation at a time with an explicit timeout.
