export type SetupOptions = {
  logger?: (msg: string) => void;
  exitOnCancel?: boolean;
};

export function setupCancellationHandlers(options?: SetupOptions): () => void {
  const {
    logger = (m: string) => console.error(m),
    exitOnCancel = process.env.NODE_ENV !== 'test',
  } = options ?? {};

  const onCancel = (): void => {
    console.log('');
    console.log('');
    logger('Setup cancelled by user');
    console.log('');
    if (exitOnCancel) process.exit(0);
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
