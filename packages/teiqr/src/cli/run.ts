/**
 * The `teiqr` command.
 *
 * Split from the executable shim so it can be tested directly: the entry point
 * is a pure function over argv that writes through injected streams and
 * returns an exit code, rather than reaching for `process` and calling
 * `process.exit`.
 */

// Register the JPEG decoder for every command that reads an image.
//
// It is opt-in for library consumers, because a bundle should not carry a
// decoder for a format the caller may never meet. That reasoning does not
// apply to an executable: nobody installs a CLI to save three kilobytes, and
// telling someone at a shell prompt to "add `import 'teiqr/jpeg'`" is advice
// they cannot act on — there is no module of theirs to add it to.
// `teiqr scan photo.jpg` should simply work.
//
// This sits here rather than in the `cli.ts` shim on purpose. The shim exists
// only to supply Node's filesystem and streams; everything that decides what
// the commands can *do* belongs to the surface the tests drive in-process.
// Registering in the shim would make any test of it vacuous, since the tests
// never load the shim.
import '../jpeg.js';
import { planBatch } from '../batch/batch.js';
import { parseCsv } from '../batch/csv.js';
import { encode } from '../core/encode.js';
import { encodeStructured } from '../core/structured.js';
import type { EccLevel } from '../core/types.js';
import { type ExportFormat, exportQr } from '../export/index.js';
import { createZip } from '../export/zip.js';
import { getPayloadType, PAYLOAD_TYPES, serializePayload } from '../payload/index.js';
import { parsePayload } from '../payload/parse.js';
import type { EyeBallShape, EyeFrameShape, ModuleShape, QrStyle } from '../render/types.js';
import { toTerminal } from '../terminal.js';
import { validate } from '../validate/index.js';
import { scanAll } from '../verify/api.js';
import { ArgError, type FlagSpec, formatFlags, parseArgs } from './args.js';

/** Everything the command needs from the outside world, so tests can supply their own. */
export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
}

const GENERATE_FLAGS: Record<string, FlagSpec> = {
  output: {
    kind: 'string',
    short: 'o',
    value: 'file',
    describe: 'Write to a file instead of the terminal',
  },
  format: {
    kind: 'string',
    short: 'f',
    value: 'svg|png|pdf|eps',
    describe: 'Output format. Inferred from --output when omitted',
  },
  ecc: {
    kind: 'string',
    short: 'e',
    value: 'L|M|Q|H',
    describe: 'Error correction level (default M)',
  },
  scale: {
    kind: 'number',
    short: 's',
    value: 'px',
    describe: 'Pixels per module for raster output (default 10)',
  },
  'side-mm': { kind: 'number', value: 'mm', describe: 'Physical size for pdf and eps output' },
  shape: { kind: 'string', value: 'name', describe: 'Module shape, e.g. rounded, dot, fluid' },
  'eye-frame': { kind: 'string', value: 'name', describe: 'Eye frame shape' },
  'eye-ball': { kind: 'string', value: 'name', describe: 'Eye ball shape' },
  colour: {
    kind: 'string',
    short: 'c',
    value: 'hex',
    describe: 'Foreground colour (default #000000)',
  },
  background: {
    kind: 'string',
    short: 'b',
    value: 'hex',
    describe: 'Background colour, or "none"',
  },
  'quiet-zone': { kind: 'number', value: 'modules', describe: 'Quiet zone width (default 4)' },
  type: {
    kind: 'string',
    short: 't',
    value: 'name',
    describe: 'Payload type, e.g. wifi or vcard. Remaining args are key=value pairs',
  },
  invert: { kind: 'boolean', describe: 'Invert terminal output, for dark backgrounds' },
  validate: { kind: 'boolean', describe: 'Print a scannability report' },
  split: { kind: 'boolean', describe: 'Split oversized payloads across a Structured Append set' },
  help: { kind: 'boolean', short: 'h', describe: 'Show this help' },
};

const SCAN_FLAGS: Record<string, FlagSpec> = {
  json: { kind: 'boolean', short: 'j', describe: 'Emit the full result as JSON' },
  all: {
    kind: 'boolean',
    short: 'a',
    describe: 'Report every code in the image, not just the first',
  },
  parse: { kind: 'boolean', short: 'p', describe: 'Decompose the payload into fields' },
  help: { kind: 'boolean', short: 'h', describe: 'Show this help' },
};

const BATCH_FLAGS: Record<string, FlagSpec> = {
  type: {
    kind: 'string',
    short: 't',
    value: 'name',
    describe: 'Payload type for every row (required)',
  },
  output: {
    kind: 'string',
    short: 'o',
    value: 'dir|zip',
    describe: 'Output directory, or a .zip file',
  },
  format: {
    kind: 'string',
    short: 'f',
    value: 'svg|png|pdf|eps',
    describe: 'Output format (default png)',
  },
  ecc: { kind: 'string', short: 'e', value: 'L|M|Q|H', describe: 'Error correction level' },
  scale: { kind: 'number', short: 's', value: 'px', describe: 'Pixels per module (default 10)' },
  'fill-from-sample': {
    kind: 'boolean',
    describe: 'Fill absent columns from the payload type sample',
  },
  help: { kind: 'boolean', short: 'h', describe: 'Show this help' },
};

const USAGE = `teiqr — generate, scan and batch QR codes

USAGE
  teiqr <text>                     Print a QR code to the terminal
  teiqr <text> -o code.png         Write it to a file
  teiqr scan <image>               Decode a QR code
  teiqr batch <csv> -t wifi -o out Generate one code per row
  teiqr types                      List the built-in payload types

Run any subcommand with --help for its options.`;

const ECC_LEVELS = new Set<EccLevel>(['L', 'M', 'Q', 'H']);

const asEcc = (value: unknown): EccLevel | undefined => {
  if (value === undefined) return undefined;
  const upper = String(value).toUpperCase();
  if (!ECC_LEVELS.has(upper as EccLevel)) {
    throw new ArgError(`--ecc must be one of L, M, Q, H (got ${JSON.stringify(value)})`);
  }
  return upper as EccLevel;
};

/** Work out the format from an explicit flag, then the output extension, then the default. */
const resolveFormat = (
  explicit: unknown,
  output: string | undefined,
  fallback: ExportFormat,
): ExportFormat => {
  const valid: ExportFormat[] = ['svg', 'png', 'pdf', 'eps'];
  if (explicit !== undefined) {
    const value = String(explicit).toLowerCase();
    if (!valid.includes(value as ExportFormat)) {
      throw new ArgError(`--format must be one of ${valid.join(', ')} (got ${value})`);
    }
    return value as ExportFormat;
  }
  const extension = output?.split('.').pop()?.toLowerCase();
  if (extension && valid.includes(extension as ExportFormat)) return extension as ExportFormat;
  return fallback;
};

/** Build a style object from the styling flags. */
const styleFrom = (flags: Record<string, string | number | boolean>): Partial<QrStyle> => {
  const style: Partial<QrStyle> = {};
  if (flags.shape) style.moduleShape = String(flags.shape) as ModuleShape;
  if (flags['eye-frame']) style.eyeFrame = String(flags['eye-frame']) as EyeFrameShape;
  if (flags['eye-ball']) style.eyeBall = String(flags['eye-ball']) as EyeBallShape;
  if (flags.colour) style.body = { kind: 'solid', color: String(flags.colour) };
  if (flags.background !== undefined) {
    style.background =
      String(flags.background) === 'none'
        ? null
        : { kind: 'solid', color: String(flags.background) };
  }
  if (typeof flags['quiet-zone'] === 'number') style.quietZone = flags['quiet-zone'];
  return style;
};

/** `key=value` positionals become payload field values. */
const fieldsFrom = (positional: readonly string[]): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const item of positional) {
    const eq = item.indexOf('=');
    if (eq === -1) throw new ArgError(`Expected key=value, got ${JSON.stringify(item)}`);
    values[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return values;
};

const generate = async (argv: readonly string[], io: CliIo): Promise<number> => {
  const { positional, flags } = parseArgs(argv, GENERATE_FLAGS);

  if (flags.help || positional.length === 0) {
    io.stdout(`teiqr <text> [options]\n\nOPTIONS\n${formatFlags(GENERATE_FLAGS)}\n`);
    return positional.length === 0 && !flags.help ? 1 : 0;
  }

  let text: string;
  if (flags.type) {
    const typeId = String(flags.type);
    const type = getPayloadType(typeId);
    if (!type) {
      throw new ArgError(
        `Unknown payload type ${JSON.stringify(typeId)}. Run \`teiqr types\` to list them.`,
      );
    }
    text = serializePayload(typeId, fieldsFrom(positional));
    if (!text) throw new ArgError(`No fields given for payload type ${typeId}`);
  } else {
    text = positional.join(' ');
  }

  const ecc = asEcc(flags.ecc);
  const style = styleFrom(flags);
  const output = flags.output === undefined ? undefined : String(flags.output);

  // Structured Append is opt-in: silently splitting into several images would
  // surprise anyone expecting one file at the path they named.
  if (flags.split) {
    const { symbols, count } = encodeStructured(text, ecc ? { ecc } : {});
    const format = resolveFormat(flags.format, output, 'png');
    if (!output) throw new ArgError('--split needs --output, since it produces several files');

    const stem = output.replace(/\.[^.]+$/, '');
    for (const [index, symbol] of symbols.entries()) {
      const { bytes, extension } = exportQr(symbol, style, format, {
        scale: typeof flags.scale === 'number' ? flags.scale : 10,
        sideMm: typeof flags['side-mm'] === 'number' ? flags['side-mm'] : undefined,
      });
      await io.writeFile(`${stem}-${index + 1}.${extension}`, bytes);
    }
    io.stdout(`Wrote ${count} symbols to ${stem}-1..${count}\n`);
    return 0;
  }

  const matrix = encode(text, ecc ? { ecc } : {});

  if (flags.validate) {
    const report = validate(matrix, style);
    io.stdout(`Score ${report.score}/100 · version ${matrix.version} · level ${matrix.ecc}\n`);
    for (const issue of report.issues) {
      io.stdout(`  [${issue.level}] ${issue.title}\n    ${issue.detail}\n`);
    }
    if (report.issues.length === 0) io.stdout('  No issues found.\n');
    io.stdout(
      `  Print at ${report.print.recommendedSideMm}mm for a ${report.print.span}-module span.\n`,
    );
  }

  if (!output) {
    io.stdout(`${toTerminal(matrix, { invert: Boolean(flags.invert) })}\n`);
    return 0;
  }

  const format = resolveFormat(flags.format, output, 'png');
  const { bytes, omitted } = exportQr(matrix, style, format, {
    scale: typeof flags.scale === 'number' ? flags.scale : 10,
    sideMm: typeof flags['side-mm'] === 'number' ? flags['side-mm'] : undefined,
    background: style.background === null ? null : '#ffffff',
  });
  await io.writeFile(output, bytes);
  for (const note of omitted) io.stderr(`warning: ${note}\n`);
  io.stdout(`Wrote ${output} (${bytes.length} bytes, version ${matrix.version} ${matrix.ecc})\n`);
  return 0;
};

const scanCommand = async (argv: readonly string[], io: CliIo): Promise<number> => {
  const { positional, flags } = parseArgs(argv, SCAN_FLAGS);

  if (flags.help || positional.length === 0) {
    io.stdout(`teiqr scan <image> [options]\n\nOPTIONS\n${formatFlags(SCAN_FLAGS)}\n`);
    return positional.length === 0 && !flags.help ? 1 : 0;
  }

  const bytes = await io.readFile(positional[0]);
  const results = scanAll(bytes);

  if (results.length === 0) {
    io.stderr(`No QR code found in ${positional[0]}\n`);
    return 1;
  }

  const chosen = flags.all ? results : results.slice(0, 1);

  if (flags.json) {
    io.stdout(
      `${JSON.stringify(
        chosen.map((r) => ({
          text: r.text,
          version: r.version,
          ecc: r.ecc,
          mask: r.mask,
          corrected: r.corrected,
          ...(flags.parse ? { payload: parsePayload(r.text) } : {}),
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  for (const result of chosen) {
    io.stdout(`${result.text}\n`);
    if (flags.parse) {
      const parsed = parsePayload(result.text);
      io.stdout(`  type: ${parsed.type} (${parsed.confidence})\n`);
      for (const [key, value] of Object.entries(parsed.values)) {
        io.stdout(`  ${key}: ${value}\n`);
      }
    }
  }
  return 0;
};

const batchCommand = async (argv: readonly string[], io: CliIo): Promise<number> => {
  const { positional, flags } = parseArgs(argv, BATCH_FLAGS);

  if (flags.help || positional.length === 0) {
    io.stdout(
      `teiqr batch <csv> -t <type> -o <dir|zip> [options]\n\nOPTIONS\n${formatFlags(BATCH_FLAGS)}\n`,
    );
    return positional.length === 0 && !flags.help ? 1 : 0;
  }
  if (!flags.type) throw new ArgError('batch needs --type, e.g. --type wifi');
  if (!flags.output) throw new ArgError('batch needs --output, a directory or a .zip file');

  const typeId = String(flags.type);
  if (!getPayloadType(typeId)) {
    throw new ArgError(`Unknown payload type ${JSON.stringify(typeId)}. Run \`teiqr types\`.`);
  }

  const csv = new TextDecoder().decode(await io.readFile(positional[0]));
  const plan = planBatch(typeId, parseCsv(csv), {
    fillFromSample: Boolean(flags['fill-from-sample']),
  });

  const incomplete = plan.rows.filter((row) => row.missing.length > 0);
  if (incomplete.length > 0) {
    for (const row of incomplete) {
      io.stderr(`row ${row.line}: missing ${row.missing.join(', ')}\n`);
    }
    io.stderr(
      `${incomplete.length} row(s) are missing required fields. ` +
        "Add the columns, or pass --fill-from-sample to use the type's sample values.\n",
    );
    return 1;
  }

  const format = resolveFormat(flags.format, undefined, 'png');
  const ecc = asEcc(flags.ecc);
  const scale = typeof flags.scale === 'number' ? flags.scale : 10;
  const output = String(flags.output);
  const toZip = output.toLowerCase().endsWith('.zip');

  const entries: { name: string; data: Uint8Array }[] = [];
  for (const row of plan.rows) {
    const text = serializePayload(typeId, row.values);
    const { bytes, extension } = exportQr(encode(text, ecc ? { ecc } : {}), {}, format, { scale });
    entries.push({ name: `${row.filename}.${extension}`, data: bytes });
  }

  if (toZip) {
    await io.writeFile(output, createZip(entries.map((e) => ({ ...e, store: format === 'png' }))));
    io.stdout(`Wrote ${entries.length} codes to ${output}\n`);
    return 0;
  }

  await io.mkdir(output);
  for (const entry of entries) {
    await io.writeFile(`${output}/${entry.name}`, entry.data);
  }
  io.stdout(`Wrote ${entries.length} codes to ${output}/\n`);
  return 0;
};

const typesCommand = (io: CliIo): number => {
  const width = Math.max(...PAYLOAD_TYPES.map((t) => t.id.length));
  for (const type of PAYLOAD_TYPES) {
    const required = type.fields.filter((f) => f.required).map((f) => f.name);
    io.stdout(
      `  ${type.id.padEnd(width + 2)}${type.label}` +
        `${required.length > 0 ? `  (needs ${required.join(', ')})` : ''}\n`,
    );
  }
  return 0;
};

/**
 * Run the CLI.
 *
 * Returns an exit code rather than calling `process.exit`, so the whole
 * surface is testable without spawning a process.
 */
export const run = async (argv: readonly string[], io: CliIo): Promise<number> => {
  try {
    const [command, ...rest] = argv;

    if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
      io.stdout(`${USAGE}\n`);
      return command === undefined ? 1 : 0;
    }
    if (command === '--version' || command === '-v') {
      // Read at build time from package.json would need a bundler import
      // assertion; the shim passes it in instead.
      io.stdout('teiqr\n');
      return 0;
    }
    if (command === 'scan') return await scanCommand(rest, io);
    if (command === 'batch') return await batchCommand(rest, io);
    if (command === 'types') return typesCommand(io);

    // Anything else is treated as the payload, so `teiqr "https://…"` works
    // without a subcommand.
    return await generate(argv, io);
  } catch (error) {
    if (error instanceof ArgError) {
      io.stderr(`error: ${error.message}\n`);
      return 2;
    }
    io.stderr(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};

export { USAGE };
