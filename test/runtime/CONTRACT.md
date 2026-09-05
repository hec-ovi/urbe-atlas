# Test runtime

Completes each Vitest task with a full native event-loop turn so synchronous city tests leave worker messages serviceable.

## In and out

`CooperativeRunner.onAfterRunTask(test)` uses the task schema from `VitestTestRunner.onAfterRunTask` in `vitest/runners`, then returns `Promise<void>` after normal task completion and two immediate phases spanning I/O polling. `vite.config.ts` selects this runner for `npm test`.

## Invariants

- Vitest owns assertions, results, cleanup and fixture time limits.
- Native callbacks and their next-turn completion run before the next task, even while test clocks are fake.
- The runner adds no sleep duration, retries, skipped tests or result filtering.

## Errors and dependencies

Vitest errors propagate unchanged. Depends on `vitest/runners` and `node:timers/promises`.
