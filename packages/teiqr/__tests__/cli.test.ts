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
    const long = 'abcdefghij0123456789'.repeat(400);
    expect(await run([long, '--split', '-o', 'part.png'], h.io)).toBe(0);
    expect(h.fs.has('part-1.png')).toBe(true);
    expect(h.fs.has('part-2.png')).toBe(true);
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
