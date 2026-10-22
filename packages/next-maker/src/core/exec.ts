import spawn from 'cross-spawn';

/** What a finished command printed. */
export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * A failed command. Carries what it printed, so a caller can show why, and the
 * spawn error `code` (`ENOENT` when the binary is missing) when it never ran.
 */
export interface ExecError extends Error {
  code?: string | number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  /** Kill the command once it has printed more than this many bytes. */
  maxBuffer?: number;
}

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Run a command with its arguments as an argv array — never a shell string.
 *
 * Package names and paths flow in from generators and manifests; under a
 * shell a name containing metacharacters would be interpreted, here every
 * argument is inert data.
 *
 * `cross-spawn` is what makes that hold on Windows too. There `npm`, `pnpm`,
 * `yarn` and `node_modules/.bin/biome` are `.cmd` shims, which
 * `child_process.execFile` cannot find without the extension and, since the
 * CVE-2024-27980 fix, refuses to run without `shell: true`. cross-spawn
 * resolves the shim and escapes each argument for `cmd.exe`, so the argv
 * stays inert on every platform.
 */
export const exec = (
  command: string,
  args: readonly string[],
  options: ExecOptions = {},
): Promise<ExecResult> =>
  new Promise((resolve, reject) => {
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
    const child = spawn(command, [...args], { cwd: options.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let size = 0;
    let settled = false;

    const fail = (error: Partial<ExecError> & Error) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(error, { stdout, stderr }));
    };

    const collect = (stream: 'stdout' | 'stderr') => (chunk: string) => {
      size += Buffer.byteLength(chunk);
      if (stream === 'stdout') stdout += chunk;
      else stderr += chunk;
      if (size > maxBuffer) {
        child.kill();
        fail(
          Object.assign(new Error(`${command} printed more than ${maxBuffer} bytes`), {
            code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
          }),
        );
      }
    };
    child.stdout?.setEncoding('utf8').on('data', collect('stdout'));
    child.stderr?.setEncoding('utf8').on('data', collect('stderr'));

    child.on('error', fail);
    child.on('close', (code, signal) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve({ stdout, stderr });
        return;
      }
      fail(
        Object.assign(
          new Error(`Command failed: ${command} ${args.join(' ')} (${signal ?? `exit ${code}`})`),
          { code, signal },
        ),
      );
    });
  });

/** The synchronous form, for a command whose output is shown as it is. */
export const execSync = (
  command: string,
  args: readonly string[],
  options: { cwd?: string } = {},
): { status: number | null; output: string } => {
  const run = spawn.sync(command, [...args], {
    cwd: options.cwd,
    encoding: 'utf-8',
    windowsHide: true,
  });
  return { status: run.status, output: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() };
};
