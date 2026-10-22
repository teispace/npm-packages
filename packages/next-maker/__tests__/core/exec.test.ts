import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ExecError, exec, execSync } from '../../src/core/exec';
import { biomeBinary } from '../../src/core/format';

const node = process.execPath;
const printArgs = 'console.log(JSON.stringify(process.argv.slice(1)))';

/** Arguments a shell would act on. Each must reach the program unchanged. */
const HOSTILE = [
  'a;echo pwned',
  'b && echo pwned',
  'c | more',
  '"quoted"',
  '%PATH%',
  '$HOME',
  'x^y',
];

describe('exec', () => {
  it('returns what the command printed', async () => {
    const { stdout } = await exec(node, ['-e', 'process.stdout.write("hi")']);
    expect(stdout).toBe('hi');
  });

  it('passes every argument through verbatim, never through a shell', async () => {
    const { stdout } = await exec(node, ['-e', printArgs, ...HOSTILE]);
    expect(JSON.parse(stdout)).toEqual(HOSTILE);
  });

  it('runs in the given directory', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'exec-cwd-'));
    try {
      const { stdout } = await exec(node, ['-e', 'process.stdout.write(process.cwd())'], { cwd });
      expect(path.basename(stdout)).toBe(path.basename(cwd));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('rejects a failure with its exit code and everything it printed', async () => {
    const error = (await exec(node, [
      '-e',
      'console.log("partial"); console.error("why"); process.exit(3)',
    ]).catch((e) => e)) as ExecError;
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(3);
    expect(error.stdout).toContain('partial');
    expect(error.stderr).toContain('why');
  });

  it('reports a missing binary as ENOENT', async () => {
    const error = (await exec('next-maker-no-such-binary', []).catch((e) => e)) as ExecError;
    expect(error.code).toBe('ENOENT');
  });

  it('stops a command that prints more than maxBuffer', async () => {
    const error = (await exec(node, ['-e', 'process.stdout.write("x".repeat(1e6))'], {
      maxBuffer: 1000,
    }).catch((e) => e)) as ExecError;
    expect(error.code).toBe('ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
  });
});

describe('execSync', () => {
  it('returns the status and combined output', () => {
    const run = execSync(node, ['-e', 'console.log("out"); console.error("err"); process.exit(2)']);
    expect(run.status).toBe(2);
    expect(run.output).toContain('out');
    expect(run.output).toContain('err');
  });
});

describe('biomeBinary', () => {
  it('uses the .cmd launcher on Windows, where the extensionless shim cannot run', () => {
    expect(path.basename(biomeBinary('/p', 'win32'))).toBe('biome.cmd');
    expect(path.basename(biomeBinary('/p', 'linux'))).toBe('biome');
  });
});

/**
 * The reason this module exists. npm, pnpm, yarn and node_modules/.bin tools
 * are `.cmd` shims on Windows; Node's execFile cannot run them, and a shell
 * would interpret the arguments. These run only on a Windows runner (CI has a
 * job for it).
 */
describe.runIf(process.platform === 'win32')('on Windows', () => {
  let dir = '';
  let shim = '';

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'exec-win-'));
    shim = path.join(dir, 'print-args.cmd');
    // Shaped like the shims npm writes: the script forwards %* to node.
    await writeFile(shim, `@"${node}" -e "${printArgs}" -- %*\r\n`);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('runs a package manager by its bare name', async () => {
    const { stdout } = await exec('npm', ['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('runs a .cmd shim with hostile arguments kept inert', async () => {
    const { stdout } = await exec(shim, HOSTILE);
    expect(JSON.parse(stdout)).toEqual(HOSTILE);
  });
});
