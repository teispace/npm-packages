import ora, { Ora, Options } from 'ora';

// Create and start a spinner
export function startSpinner(text = '', options?: Options): Ora {
  const spinner = ora({ text, ...options });
  spinner.start();
  return spinner;
}

// Stop a spinner without changing its status
export function stopSpinner(spinner: Ora): void {
  spinner.stop();
}

// Mark spinner as succeeded
export function succeedSpinner(spinner: Ora, text?: string): void {
  spinner.succeed(text);
}

// Mark spinner as failed
export function failSpinner(spinner: Ora, text?: string): void {
  spinner.fail(text);
}

// Run an async function while showing a spinner; auto-succeed/fail
export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  {
    successText,
    failText,
    options,
  }: { successText?: string; failText?: string; options?: Options } = {},
): Promise<T> {
  const spinner = startSpinner(text, options);
  try {
    const result = await fn();
    spinner.succeed(successText ?? 'Done');
    return result;
  } catch (err) {
    spinner.fail(failText ?? 'Failed');
    throw err;
  }
}

export default startSpinner;
