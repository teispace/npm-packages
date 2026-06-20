export type SetupOptions = {
  logger?: (msg: string) => void;
  exitOnCancel?: boolean;
};

/**
 * An async cleanup callback run when the process is cancelled (Ctrl-C /
 * SIGTERM). Commands that create on-disk state (e.g. `init` scaffolding a
 * project directory) register one of these so the half-written state is
 * removed before the process exits.
 */
export type CancellationCleanup = () => void | Promise<void>;

// Cleanup callbacks registered by in-flight commands. A Set so a command can
// deregister its own callback once it has completed successfully (and so the
// same callback is never run twice).
const cleanups = new Set<CancellationCleanup>();

/**
 * Register an async cleanup to run on cancellation. Returns a deregister
 * function the caller must invoke on successful completion so the cleanup does
 * not run for a finished command.
 *
 * This is the mechanism that fixes the prior Ctrl-C bug: the global SIGINT
 * handler used to call `process.exit(0)` synchronously, which terminated the
 * process before a command's own async cleanup (registered via a second
 * `process.on('SIGINT')`) could delete its half-created output — leaving an
 * orphaned project directory AND reporting success (exit 0). Cleanups now run
 * through this single registry, are awaited, and cancellation exits non-zero.
 */
export function onCancellation(cleanup: CancellationCleanup): () => void {
  cleanups.add(cleanup);
  return () => cleanups.delete(cleanup);
}

/** Test-only: clear the registry between cases. */
export function _resetCancellationCleanups(): void {
  cleanups.clear();
}

export function setupCancellationHandlers(options?: SetupOptions): () => void {
  const {
    logger = (m: string) => console.error(m),
    exitOnCancel = process.env.NODE_ENV !== 'test',
  } = options ?? {};

  // Guard against re-entrancy: a second Ctrl-C while cleanup is running should
  // not kick off cleanup again, but a truly impatient user pressing it twice
  // should still be able to force-exit.
  let cancelling = false;

  const runCleanups = async (): Promise<void> => {
    const pending = [...cleanups];
    cleanups.clear();
    for (const cleanup of pending) {
      try {
        await cleanup();
      } catch (err) {
        logger(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // `exitCode` is 0 for an idle Ctrl-C (nothing in progress) and 130 — the
  // conventional "terminated by SIGINT" code — when a command was interrupted
  // mid-flight. Reporting non-zero on interruption is the second half of the
  // bug fix (cancellation used to exit 0, i.e. "success").
  const onCancel = (): void => {
    if (cancelling) {
      // Second interrupt: stop waiting and bail immediately.
      if (exitOnCancel) process.exit(130);
      return;
    }
    cancelling = true;
    const hadWork = cleanups.size > 0;

    void runCleanups().then(() => {
      console.log('');
      logger('Setup cancelled by user');
      console.log('');
      if (exitOnCancel) process.exit(hadWork ? 130 : 0);
    });
  };

  const onUncaught = (err: unknown): void => {
    if (err !== null && typeof err === 'object' && 'code' in err) {
      const maybeErrWithCode = err as { code?: unknown };
      if (maybeErrWithCode.code === 'ERR_USE_AFTER_CLOSE') {
        onCancel();
        return;
      }
    }

    // Log uncaught exceptions instead of throwing so the CLI can report
    // the error and exit gracefully when appropriate.
    if (err instanceof Error) {
      logger(`Uncaught exception: ${err.message}`);
      return;
    }
    logger(`Uncaught exception: ${String(err)}`);
  };

  const onRejection = (reason: unknown): void => {
    // Log unhandled promise rejections rather than letting them crash the
    // process. This converts the reason to a readable string safely.
    if (reason instanceof Error) {
      logger(`Unhandled promise rejection: ${reason.message}`);
      return;
    }
    logger(`Unhandled promise rejection: ${String(reason)}`);
  };

  process.on('SIGINT', onCancel);
  process.on('SIGTERM', onCancel);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection as (...args: unknown[]) => void);

  // Return a cleanup function to remove listeners (useful in tests).
  return (): void => {
    process.off('SIGINT', onCancel);
    process.off('SIGTERM', onCancel);
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onRejection as (...args: unknown[]) => void);
  };
}

export default setupCancellationHandlers;
