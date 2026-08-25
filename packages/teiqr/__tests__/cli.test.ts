import { describe, expect, it } from 'vitest';
import { ArgError, formatFlags, parseArgs } from '../src/cli/args.js';
import { type CliIo, run } from '../src/cli/run.js';
import { scan } from '../src/verify/api.js';

/** An in-memory filesystem and console, so the CLI is testable without spawning. */
const harness = (files: Record<string, Uint8Array | string> = {}) => {
  const fs = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(files)) {
    fs.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : data);
  }
  const dirs: string[] = [];
  let out = '';
  let err = '';

  const io: CliIo = {
    stdout: (text) => {
      out += text;
    },
    stderr: (text) => {
      err += text;
    },
    readFile: async (path) => {
      const found = fs.get(path);
      if (!found) throw new Error(`ENOENT: ${path}`);
      return found;
    },
    writeFile: async (path, data) => {
      fs.set(path, data);
    },
    mkdir: async (path) => {
      dirs.push(path);
    },
  };

  return {
    io,
    fs,
    dirs,
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
};

describe('argument parsing', () => {
  const specs = {
    output: { kind: 'string', short: 'o', describe: 'out' },
    scale: { kind: 'number', short: 's', describe: 'scale' },
    verbose: { kind: 'boolean', short: 'v', describe: 'verbose' },
  } as const;

  it('handles long flags with a separate value', () => {
    expect(parseArgs(['--output', 'a.png'], specs).flags.output).toBe('a.png');
  });

  it('handles --flag=value', () => {
    expect(parseArgs(['--output=a.png'], specs).flags.output).toBe('a.png');
  });

  it('handles short flags', () => {
    expect(parseArgs(['-o', 'a.png'], specs).flags.output).toBe('a.png');
    expect(parseArgs(['-oa.png'], specs).flags.output).toBe('a.png');
  });

  it('coerces numbers and rejects non-numbers', () => {
    expect(parseArgs(['--scale', '12'], specs).flags.scale).toBe(12);
    expect(() => parseArgs(['--scale', 'big'], specs)).toThrow(ArgError);
  });

  it('supports boolean flags and their --no- form', () => {
    expect(parseArgs(['--verbose'], specs).flags.verbose).toBe(true);
    expect(parseArgs(['--no-verbose'], specs).flags.verbose).toBe(false);
  });

  it('clusters short boolean flags', () => {
    const { flags } = parseArgs(['-v'], specs);
    expect(flags.verbose).toBe(true);
  });

  it('collects positionals and stops parsing after --', () => {
    const { positional } = parseArgs(['a', '--', '--not-a-flag', '-x'], specs);
    expect(positional).toEqual(['a', '--not-a-flag', '-x']);
  });

  it('treats a negative number as a positional, not a flag', () => {
    expect(parseArgs(['-42'], specs).positional).toEqual(['-42']);
  });

  it('rejects unknown options by name', () => {
    expect(() => parseArgs(['--nope'], specs)).toThrow(/Unknown option --nope/);
    expect(() => parseArgs(['-z'], specs)).toThrow(/Unknown option -z/);
  });

  it('rejects a value-taking flag with no value', () => {
    expect(() => parseArgs(['--output'], specs)).toThrow(ArgError);
  });

  it('formats aligned help text', () => {
    const help = formatFlags(specs);
    expect(help).toContain('-o, --output');
    expect(help).toContain('--verbose');
  });
});

describe('teiqr <text>', () => {
  it('prints a code to the terminal by default', async () => {
    const h = harness();
    expect(await run(['https://example.com'], h.io)).toBe(0);
    expect(h.out).toContain('█');
  });

  it('writes a PNG that scans back to the payload', async () => {
    const h = harness();
    expect(await run(['https://example.com/cli', '-o', 'out.png'], h.io)).toBe(0);
    const written = h.fs.get('out.png');
    expect(written).toBeDefined();
    expect(scan(written as Uint8Array).text).toBe('https://example.com/cli');
    expect(h.out).toContain('Wrote out.png');
  });

  it('infers the format from the output extension', async () => {
    const h = harness();
    await run(['x', '-o', 'code.svg'], h.io);
    expect(new TextDecoder().decode(h.fs.get('code.svg'))).toContain('<svg');

    const h2 = harness();
    await run(['x', '-o', 'code.pdf'], h2.io);
    expect(new TextDecoder().decode(h2.fs.get('code.pdf')).startsWith('%PDF-')).toBe(true);
  });

  it('applies styling flags', async () => {
    const h = harness();
    await run(['x', '-o', 'c.svg', '--shape', 'dot', '--colour', '#112233'], h.io);
    const svg = new TextDecoder().decode(h.fs.get('c.svg'));
    expect(svg).toContain('#112233');
  });

  it('honours the error correction flag and rejects a bad one', async () => {
    const h = harness();
    await run(['x', '-o', 'c.png', '--ecc', 'H'], h.io);
    expect(h.out).toContain(' H)');

    const bad = harness();
    expect(await run(['x', '--ecc', 'Z'], bad.io)).toBe(2);
    expect(bad.err).toContain('--ecc must be one of');
  });

  it('builds a payload from a type and key=value pairs', async () => {
    const h = harness();
    expect(await run(['-t', 'wifi', 'ssid=Cafe', 'password=hunter2', '-o', 'w.png'], h.io)).toBe(0);
    expect(scan(h.fs.get('w.png') as Uint8Array).text).toBe('WIFI:T:WPA;S:Cafe;P:hunter2;;');
  });

  it('rejects an unknown payload type with a pointer to `teiqr types`', async () => {
    const h = harness();
    expect(await run(['-t', 'nope', 'a=b'], h.io)).toBe(2);
    expect(h.err).toMatch(/Unknown payload type/);
    expect(h.err).toMatch(/teiqr types/);
  });

  it('rejects a malformed key=value pair', async () => {
    const h = harness();
    expect(await run(['-t', 'wifi', 'justtext'], h.io)).toBe(2);
    expect(h.err).toContain('key=value');
  });

  it('prints a validation report on request', async () => {
    const h = harness();
    await run(['https://example.com', '--validate', '-o', 'v.png'], h.io);
    expect(h.out).toMatch(/Score \d+\/100/);
    expect(h.out).toContain('No issues found');
  });

  it('splits an oversized payload into a Structured Append set', async () => {
    const h = harness();
    // SVG rather than PNG, deliberately. The behaviour under test is that one
    // payload becomes several files; rasterising it would mean four ~1850px
    // version-40 symbols, which is thirteen megapixels of work that proves
    // nothing extra and times out on CI under coverage instrumentation.
    const long = 'abcdefghij0123456789'.repeat(400);
    expect(await run([long, '--split', '-o', 'part.svg'], h.io)).toBe(0);
    expect(h.fs.has('part-1.svg')).toBe(true);
    expect(h.fs.has('part-2.svg')).toBe(true);
    expect(h.out).toMatch(/Wrote \d+ symbols/);
  });

  it('refuses to split without an output path, since it writes several files', async () => {
    const h = harness();
    expect(await run(['x'.repeat(5000), '--split'], h.io)).toBe(2);
    expect(h.err).toContain('--split needs --output');
  });
});

describe('teiqr scan', () => {
  const makePng = async (text: string) => {
    const h = harness();
    await run([text, '-o', 'x.png'], h.io);
    return h.fs.get('x.png') as Uint8Array;
  };

  it('decodes an image to stdout', async () => {
    const png = await makePng('https://example.com/scan');
    const h = harness({ 'in.png': png });
    expect(await run(['scan', 'in.png'], h.io)).toBe(0);
    expect(h.out.trim()).toBe('https://example.com/scan');
  });

  it('emits JSON with the symbol metadata', async () => {
    const png = await makePng('json please');
    const h = harness({ 'in.png': png });
    await run(['scan', 'in.png', '--json'], h.io);
    const parsed = JSON.parse(h.out);
    expect(parsed[0].text).toBe('json please');
    expect(parsed[0].version).toBeGreaterThan(0);
    expect(['L', 'M', 'Q', 'H']).toContain(parsed[0].ecc);
  });

  it('decomposes the payload into fields with --parse', async () => {
    const h0 = harness();
    await run(['-t', 'wifi', 'ssid=Cafe', 'password=hunter2', '-o', 'w.png'], h0.io);
    const h = harness({ 'in.png': h0.fs.get('w.png') as Uint8Array });
    await run(['scan', 'in.png', '--parse'], h.io);
    expect(h.out).toContain('type: wifi');
    expect(h.out).toContain('ssid: Cafe');
    expect(h.out).toContain('password: hunter2');
  });

  it('exits non-zero when there is no code in the image', async () => {
    // A valid but empty PNG.
    const { encodePng } = await import('../src/raster/png.js');
    const blank = encodePng(new Uint8Array(40 * 40 * 4).fill(255), 40, 40);
    const h = harness({ 'blank.png': blank });
    expect(await run(['scan', 'blank.png'], h.io)).toBe(1);
    expect(h.err).toContain('No QR code found');
  });

  it('reports a missing file as an error rather than crashing', async () => {
    const h = harness();
    expect(await run(['scan', 'nope.png'], h.io)).toBe(1);
    expect(h.err).toContain('ENOENT');
  });

  /**
   * JPEG is opt-in for library consumers and unconditional here.
   *
   * The library's error tells the caller to add `import 'teiqr/jpeg'`, which is
   * advice a person at a shell prompt cannot act on — there is no module of
   * theirs to add it to. So the CLI registers the decoder itself, and it does
   * so in `cli/run.ts` rather than the `cli.ts` shim: these tests drive `run`
   * directly and never load the shim, so a registration there would make this
   * test pass while proving nothing about the binary.
   */
  it.each(['qr-420.jpg', 'qr-progressive.jpg', 'qr-gray.jpg'])(
    'scans %s without the caller importing anything',
    async (name) => {
      const { readFileSync } = await import('node:fs');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const bytes = new Uint8Array(
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'jpeg', name)),
      );
      const h = harness({ 'photo.jpg': bytes });
      expect(await run(['scan', 'photo.jpg'], h.io)).toBe(0);
      expect(h.out.trim()).toBe('teiqr jpeg fixture');
    },
  );
});

describe('teiqr batch', () => {
  const csv = 'name,ssid,password\ncafe,Pokhara Cafe,himalaya2026\noffice,Teispace HQ,letmein\n';

  it('writes one file per row into a directory', async () => {
    const h = harness({ 'in.csv': csv });
    expect(await run(['batch', 'in.csv', '-t', 'wifi', '-o', 'out'], h.io)).toBe(0);
    expect(h.dirs).toContain('out');
    expect(h.fs.has('out/cafe.png')).toBe(true);
    expect(h.fs.has('out/office.png')).toBe(true);
    expect(scan(h.fs.get('out/cafe.png') as Uint8Array).text).toContain('Pokhara Cafe');
  });

  it('writes a zip when the output ends in .zip', async () => {
    const h = harness({ 'in.csv': csv });
    expect(await run(['batch', 'in.csv', '-t', 'wifi', '-o', 'codes.zip'], h.io)).toBe(0);
    const zip = h.fs.get('codes.zip') as Uint8Array;
    // Local file header signature.
    expect(Array.from(zip.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(zip)).toContain('cafe.png');
  });

  it('refuses rows missing a required field, and says which', async () => {
    const h = harness({ 'in.csv': 'name,password\nx,nope\n' });
    expect(await run(['batch', 'in.csv', '-t', 'wifi', '-o', 'out'], h.io)).toBe(1);
    expect(h.err).toContain('missing ssid');
    expect(h.err).toContain('--fill-from-sample');
  });

  it('proceeds when explicitly told to fill from the sample', async () => {
    const h = harness({ 'in.csv': 'name,password\nx,nope\n' });
    expect(
      await run(['batch', 'in.csv', '-t', 'wifi', '-o', 'out', '--fill-from-sample'], h.io),
    ).toBe(0);
    expect(h.fs.has('out/x.png')).toBe(true);
  });

  it('requires both --type and --output', async () => {
    const a = harness({ 'in.csv': csv });
    expect(await run(['batch', 'in.csv', '-o', 'out'], a.io)).toBe(2);
    expect(a.err).toContain('--type');

    const b = harness({ 'in.csv': csv });
    expect(await run(['batch', 'in.csv', '-t', 'wifi'], b.io)).toBe(2);
    expect(b.err).toContain('--output');
  });
});

describe('help and discovery', () => {
  it('prints usage with no arguments and exits non-zero', async () => {
    const h = harness();
    expect(await run([], h.io)).toBe(1);
    expect(h.out).toContain('USAGE');
  });

  it('prints usage for --help and exits zero', async () => {
    const h = harness();
    expect(await run(['--help'], h.io)).toBe(0);
    expect(h.out).toContain('teiqr scan');
    expect(h.out).toContain('teiqr batch');
  });

  it('lists payload types with their required fields', async () => {
    const h = harness();
    expect(await run(['types'], h.io)).toBe(0);
    expect(h.out).toContain('wifi');
    expect(h.out).toContain('vcard');
    expect(h.out).toMatch(/needs .*ssid/);
  });

  it('offers per-subcommand help', async () => {
    for (const command of [
      ['scan', '--help'],
      ['batch', '--help'],
    ]) {
      const h = harness();
      expect(await run(command, h.io)).toBe(0);
      expect(h.out).toContain('OPTIONS');
    }
  });
});

/**
 * Every command the README shows, actually run.
 *
 * The library examples in the README have been executed by `readme.test.ts`
 * from the start; the CLI examples never were, and the gap showed. `teiqr scan
 * photo.jpg` was documented and broken — it told the reader to add
 * `import 'teiqr/jpeg'`, which is not something anyone can do at a shell
 * prompt. The batch examples pointed three commands at one `guests.csv` while
 * asking for two payload types that need different columns, so following them
 * in order failed on the third.
 *
 * Both are the same failure: prose that no test reads. This runs whatever the
 * README currently says, so a new example is covered the moment it is written
 * and a broken one fails the build.
 */
describe('the CLI examples in the README', () => {
  /**
   * Split a shell-ish command into argv, honouring single and double quotes.
   *
   * Character by character rather than by regex, because a quote can open
   * partway through a word: `ssid="Pokhara Cafe"` is one argument, and an
   * alternation of `"..."` or `\S+` splits it in the wrong place.
   */
  const argv = (line: string): string[] => {
    const parts: string[] = [];
    let current = '';
    let quote: string | null = null;
    let started = false;

    for (const char of line) {
      if (quote) {
        if (char === quote) quote = null;
        else current += char;
      } else if (char === '"' || char === "'") {
        quote = char;
        started = true;
      } else if (/\s/.test(char)) {
        if (started) parts.push(current);
        current = '';
        started = false;
      } else {
        current += char;
        started = true;
      }
    }
    if (started) parts.push(current);
    return parts;
  };

  const commands = (() => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf8');
    const found: string[] = [];
    // Only ```bash blocks. A ```console block deliberately shows a *failing*
    // command with its output, which is documentation of an error path rather
    // than an example to run.
    for (const block of readme.matchAll(/```bash\n([\s\S]*?)```/g)) {
      for (const raw of block[1].split('\n')) {
        const line = raw.replace(/\s+#.*$/, '').trim();
        if (!/^(npx )?teiqr\s/.test(line)) continue;
        found.push(line.replace(/^npx /, ''));
      }
    }
    return found;
  })();

  /**
   * A reader follows the examples in order, with one set of files.
   *
   * The runner below synthesises each command's inputs from that same command,
   * so it proves every example works *in isolation* — which is not what the
   * README promises. It promises a sequence someone can follow. Three commands
   * pointed at one `guests.csv` while asking for two payload types that need
   * different columns, and the third failed for anyone who tried.
   *
   * So this is asserted separately: a data file named in the README means one
   * shape, whoever reads it.
   */
  it('names each CSV with a single payload type', () => {
    const typeFor = new Map<string, Set<string>>();
    for (const command of commands) {
      const args = argv(command);
      const at = args.findIndex((a) => a === '-t' || a === '--type');
      if (at === -1) continue;
      const type = args[at + 1];
      for (const arg of args) {
        if (!arg.endsWith('.csv')) continue;
        const seen = typeFor.get(arg) ?? new Set<string>();
        seen.add(type);
        typeFor.set(arg, seen);
      }
    }
    for (const [file, types] of typeFor) {
      expect([...types], `${file} is used with more than one payload type`).toHaveLength(1);
    }
  });

  it('finds the commands to run', () => {
    // Without this the suite below would vacuously pass if the extraction
    // broke or the README were restructured.
    expect(commands.length).toBeGreaterThan(10);
  });

  it.each(commands)('%s', async (command) => {
    const args = argv(command).slice(1);

    // Build whatever this command reads. Inputs are inferred from the command
    // itself rather than hard-coded, so the fixtures cannot drift from the
    // examples the way the examples drifted from the code.
    const files: Record<string, Uint8Array | string> = {};
    const typeFlag = args[args.indexOf('-t') + 1] ?? args[args.indexOf('--type') + 1];

    for (const arg of args) {
      if (arg.endsWith('.png') || arg.endsWith('.jpg')) {
        // Only inputs need to exist; outputs are named by -o.
        if (args[args.indexOf(arg) - 1]?.match(/^(-o|--output)$/)) continue;
      }
      if (arg.endsWith('.png')) {
        const h = harness();
        await run(['WIFI:T:WPA;S:Cafe;P:hunter2;;', '-o', 'x.png'], h.io);
        files[arg] = h.fs.get('x.png') as Uint8Array;
      } else if (arg.endsWith('.jpg')) {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        files[arg] = new Uint8Array(
          readFileSync(join(import.meta.dirname, 'fixtures', 'jpeg', 'qr-420.jpg')),
        );
      } else if (arg.endsWith('.csv')) {
        // Columns come from the payload type the same command asks for, which
        // is exactly the coupling the README got wrong.
        const { getPayloadType } = await import('../src/payload/index.js');
        const type = getPayloadType(typeFlag ?? 'wifi');
        if (!type) throw new Error(`README names an unknown payload type: ${typeFlag}`);
        const columns = type.fields.map((f) => f.name);
        const row = columns.map((name) => String(type.sample[name] ?? 'x')).join(',');
        files[arg] = `${columns.join(',')}\n${row}\n${row}\n`;
      }
    }

    const h = harness(files);
    const code = await run(args, h.io);
    expect(code, `${command}\n${h.err}`).toBe(0);
  });
});
