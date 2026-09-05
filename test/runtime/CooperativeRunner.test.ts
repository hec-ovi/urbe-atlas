import { setImmediate as scheduleNative } from 'node:timers';
import { afterAll, describe, expect, it, vi } from 'vitest';

describe.sequential('native test task scheduling', () => {
  let delivered = false;
  afterAll(() => vi.useRealTimers());

  it('queues native completion work while test clocks are fake', () => {
    vi.useFakeTimers();
    scheduleNative(() => scheduleNative(() => { delivered = true; }));
    expect(delivered).toBe(false);
  });

  it('delivers completion work before the next task without advancing its fake clock', () => {
    expect(vi.isFakeTimers()).toBe(true);
    expect(delivered).toBe(true);
  });
});
