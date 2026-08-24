/**
 * Argument parsing.
 *
 * Hand-rolled rather than pulled from a dependency, for the same reason the
 * rest of this package is: `teiqr` has no runtime dependencies, and a CLI
 * argument parser is about eighty lines. Adding `commander` or `yargs` would
 * more than double the install size of a package whose whole pitch is that it
 * installs nothing.
 */

/** How a flag consumes its argument. */
export type FlagKind = 'string' | 'number' | 'boolean';

export interface FlagSpec {
  readonly kind: FlagKind;
  /** Single-character alias, without the dash. */
  readonly short?: string;
  /** Shown in `--help`. */
  readonly describe: string;
  /** Placeholder shown after the flag name in help, for non-boolean flags. */
  readonly value?: string;
}

export interface ParsedArgs {
  /** Positional arguments, in order. */
  readonly positional: string[];
  readonly flags: Record<string, string | number | boolean>;
}

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgError';
  }
}

/**
 * Parse `argv` against a flag table.
 *
 * Supports `--flag value`, `--flag=value`, `-f value`, `--no-flag` for
 * booleans, and `--` to stop parsing so a payload beginning with a dash can be
 * passed literally.
 */
export const parseArgs = (
  argv: readonly string[],
  specs: Readonly<Record<string, FlagSpec>>,
): ParsedArgs => {
  const byShort = new Map<string, string>();
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.short) byShort.set(spec.short, name);
  }

  const positional: string[] = [];
  const flags: Record<string, string | number | boolean> = {};

  const setFlag = (name: string, raw: string | undefined, spec: FlagSpec): void => {
    if (spec.kind === 'boolean') {
      flags[name] = raw === undefined ? true : raw !== 'false';
      return;
    }
    if (raw === undefined) throw new ArgError(`--${name} needs a value`);
    if (spec.kind === 'number') {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new ArgError(`--${name} expects a number, got ${JSON.stringify(raw)}`);
      }
      flags[name] = value;
      return;
    }
    flags[name] = raw;
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    // Everything after `--` is positional, so a payload can start with a dash.
    if (token === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      let name = eq === -1 ? body : body.slice(0, eq);
      let inline = eq === -1 ? undefined : body.slice(eq + 1);

      // `--no-colour` turns a boolean off.
      let negated = false;
      if (!specs[name] && name.startsWith('no-') && specs[name.slice(3)]) {
        name = name.slice(3);
        negated = true;
      }

      const spec = specs[name];
      if (!spec) throw new ArgError(`Unknown option --${name}`);

      if (negated) {
        flags[name] = false;
        continue;
      }
      if (spec.kind !== 'boolean' && inline === undefined) {
        inline = argv[++i];
      }
      setFlag(name, inline, spec);
      continue;
    }

    if (token.startsWith('-') && token.length > 1 && !/^-\d/.test(token)) {
      // Short flags: `-o file`, and clustered booleans like `-qv`.
      const letters = token.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const name = byShort.get(letters[j]);
        if (!name) throw new ArgError(`Unknown option -${letters[j]}`);
        const spec = specs[name];
        if (spec.kind === 'boolean') {
          flags[name] = true;
          continue;
        }
        // A value-taking short flag consumes the rest of the cluster, or the
        // next argument: `-o=x`, `-ofile` and `-o file` all work.
        const rest = letters.slice(j + 1);
        setFlag(name, rest.length > 0 ? rest.replace(/^=/, '') : argv[++i], spec);
        break;
      }
      continue;
    }

    positional.push(token);
  }

  return { positional, flags };
};

/** Render a flag table as aligned help text. */
export const formatFlags = (specs: Readonly<Record<string, FlagSpec>>): string => {
  const rows = Object.entries(specs).map(([name, spec]) => {
    const short = spec.short ? `-${spec.short}, ` : '    ';
    const value = spec.kind === 'boolean' ? '' : ` <${spec.value ?? spec.kind}>`;
    return [`  ${short}--${name}${value}`, spec.describe] as const;
  });
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `${left.padEnd(width + 2)}${right}`).join('\n');
};
