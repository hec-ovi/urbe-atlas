# Generation measurements

Blueprint 0.26.0, package 0.16.0. Sample files in `samples/` at this version:

| City | Seed | JSON | Blocks | Parcels | Templates |
| --- | --- | ---: | ---: | ---: | ---: |
| 400 x 400 m | `urbe-tiny` | 0.43 MB | 9 | 58 | 2 |
| 1000 x 1000 m | `urbe` | 2.63 MB | 64 | 528 | 8 |

The default 3000 x 3000 m city (seed `urbe`) has 576 blocks and 5255 parcels and writes 24 MB in about 8.5 s; most of it is street construction, which grows with the 1200 street edges and 625 junctions of 120 m blocks. Generation reports twelve pipeline stages (`GENERATION_STAGES` in `schema/progress.ts`). Delete on a running job terminates the worker and removes the catalog record.

## Reproduce

Use the built CLI on a sample size:

```sh
timeout 60s /usr/bin/time -f 'wall=%e user=%U system=%S rssKiB=%M' node dist/cli.mjs --seed urbe --size 1000 --out /tmp/atlas-city.json
```

CLI process measurements include module startup. Run one generation at a time with an explicit timeout.
