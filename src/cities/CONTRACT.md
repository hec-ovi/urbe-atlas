# City catalog

Purpose: queues server-side blueprint generation and keeps every created city on disk.

## Entry

`createCityApi(options?: CityApiOptions): Promise<CityApi>`, [index.ts](index.ts), [types](schema.ts). Mount `handle(req, res, next)` on a Node HTTP server and await `close()` on shutdown. Unknown paths call `next()`.

`dataDir` defaults to `ATLAS_CITY_DATA_DIR` or `.atlas-cities`, relative to the server working directory. One service owns a data directory. `workerUrl` selects the built Node worker, default `dist/city-worker.mjs`. `generator` supplies an equivalent asynchronous adapter, [schema](schema.ts).

## HTTP

| Request | Input | Output |
| --- | --- | --- |
| POST /api/cities | Raw [AtlasParams](../../schema/params.ts) | 202 [CityRecord](schema.ts), durable queued job |
| GET /api/cities | None | 200 [CityList](schema.ts), newest first |
| GET /api/cities/:id | UUID | 200 [CityRecord](schema.ts) |
| GET /api/cities/:id/blueprint | UUID | 200 exact saved [CityBlueprint](../../schema/blueprint.ts) JSON |
| DELETE /api/cities/:id | UUID | 204 empty body; queued, running, ready or failed cities |
| POST /api/cities/import | Raw [CityBlueprint](../../schema/blueprint.ts) | 201 ready [CityRecord](schema.ts) |
| GET /api/forms | None | 200 `{ forms: ["creation", "visualization"] }` |
| GET /api/forms/:name | `creation` or `visualization` | 200 [WorkspaceForm](forms/schema.ts) |

Records include original params, source, seed, timestamps and blueprint stage/status. Ready records add `blueprintUrl` and stats. Failed records add an error. Each creation gets a distinct UUID, including repeated seeds. Imports check complete top-level structure; they preserve every field and do not certify geometry. Requests require JSON objects; full generation parameter validation runs in the worker. JSON bodies are limited to 128 MiB.
Delete removes the catalog record and its directory. A running job is aborted first; a queued job is dropped. Missing ids return 404.
Workspace forms are the creation and visualization documents the UI iterates. `name` is `creation` or `visualization`. Each document lists layout, default values and widgets (heading, note, section, text, slider, select, choice, toggle, optional-number, action, action-row, presets, file, grid, layers). Adding, removing or editing a supported control is a form JSON change. Unknown names return 404.

## Errors

HTTP failures return [CityErrorResponse](schema.ts): `E_BAD_REQUEST` (400, malformed input or unsupported method), `E_NOT_FOUND` (404), `E_NOT_READY` (409), `E_STORAGE` (500), `E_INTERRUPTED` (503 during shutdown). Failed jobs retain Atlas `E_INVALID_PARAMS`, `E_UNSATISFIABLE`, `E_INVARIANT`, `E_STORAGE` for failed writes, or `E_GENERATION` for other worker failures. `E_INTERRUPTED` marks running work stopped by shutdown or server restart.

## Invariants

- Generation and JSON serialization run in a Node worker. One job runs at a time; reads and further submissions remain available.
- Submission commits a queued record before returning. Restart resumes queued jobs and marks interrupted running jobs failed.
- Ready status follows atomic blueprint and metadata writes. Completed blueprints are served from disk without regeneration or modification.
- Each city uses `<dataDir>/<id>/record.json` and `blueprint.json`. Incomplete directories without records are not catalog entries. Unreadable or invalid records fail startup with `E_STORAGE`.
- Only blueprint generation runs. Exterior and interior stages require separate explicit requests to their owners.
- The catalog contains submitted and imported cities; it cannot recover unsaved browser memory.
- Delete is terminal: a removed city cannot be opened, and its blueprint file is gone.
- Form documents are static copies of [forms/creation.json](forms/creation.json) and [forms/visualization.json](forms/visualization.json). Identical requests return identical JSON.

## Depends on

- [Atlas](../../CONTRACT.md): `generateCity`, parameter and blueprint schemas, generation errors.
