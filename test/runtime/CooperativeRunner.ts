import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { VitestTestRunner } from 'vitest/runners';

type CompletedTask = Parameters<VitestTestRunner['onAfterRunTask']>[0];

export default class CooperativeRunner extends VitestTestRunner {
  override async onAfterRunTask(test: CompletedTask): Promise<void> {
    super.onAfterRunTask(test);
    // The first immediate can share the current check phase; the second crosses I/O polling.
    await yieldToEventLoop();
    await yieldToEventLoop();
  }
}
