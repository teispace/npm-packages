import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetCancellationCleanups,
  onCancellation,
  setupCancellationHandlers,
} from '../../src/config/errorHandlers';

// Drive the handler by emitting a real SIGINT on `process` and waiting for the
// async cleanup chain to settle. process.exit is stubbed to throw a sentinel so
// we can capture the code without actually exiting the test runner.

let teardown: (() => void) | undefined;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _resetCancellationCleanups();
  // Record the exit code without actually exiting or throwing — throwing from
  // inside the handler's .then() would surface as an unhandled rejection.
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
  // Swallow the handler's console chatter.
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  teardown?.();
  teardown = undefined;
  exitSpy.mockRestore();
  vi.restoreAllMocks();
});

/**
 * Emit SIGINT and wait until the handler's async cleanup chain calls
 * process.exit (our stub records instead of exiting). Polls so cleanups with
 * real async delays are awaited; falls back after a bounded number of ticks.
 */
const emitSigintAndSettle = async (): Promise<number | undefined> => {
  process.emit('SIGINT');
  for (let i = 0; i < 50 && exitSpy.mock.calls.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (exitSpy.mock.calls.length > 0) {
    return exitSpy.mock.calls[exitSpy.mock.calls.length - 1][0] as number;
  }
  return undefined;
};

describe('setupCancellationHandlers cleanup ordering', () => {
  it('awaits a registered async cleanup before exiting (the Ctrl-C bug)', async () => {
    const order: string[] = [];
    teardown = setupCancellationHandlers({ logger: () => {}, exitOnCancel: true });

    onCancellation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('cleanup-done');
    });

    const code = await emitSigintAndSettle();

    expect(order).toEqual(['cleanup-done']); // cleanup actually ran to completion
    expect(code).toBe(130); // non-zero because work was in flight
  });

  it('exits 0 when no cleanup is registered (idle Ctrl-C)', async () => {
    teardown = setupCancellationHandlers({ logger: () => {}, exitOnCancel: true });
    const code = await emitSigintAndSettle();
    expect(code).toBe(0);
  });

  it('does not run a deregistered cleanup', async () => {
    const cleanup = vi.fn(async () => {});
    teardown = setupCancellationHandlers({ logger: () => {}, exitOnCancel: true });

    const deregister = onCancellation(cleanup);
    deregister();

    const code = await emitSigintAndSettle();
    expect(cleanup).not.toHaveBeenCalled();
    expect(code).toBe(0); // nothing in flight
  });

  it('logs but still exits when a cleanup throws', async () => {
    const logger = vi.fn();
    teardown = setupCancellationHandlers({ logger, exitOnCancel: true });

    onCancellation(async () => {
      throw new Error('boom');
    });

    const code = await emitSigintAndSettle();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('Cleanup failed'));
    expect(code).toBe(130);
  });

  it('runs every registered cleanup', async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    teardown = setupCancellationHandlers({ logger: () => {}, exitOnCancel: true });

    onCancellation(a);
    onCancellation(b);

    await emitSigintAndSettle();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});
