/**
 * The command line, driven the way a shell would.
 *
 * Running the real binary rather than printing a list of commands, so this
 * fails if the CLI changes underneath it.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { OUT, section } from './_shared.mjs';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('teiqr/package.json')), 'dist', 'cli.js');
mkdirSync(OUT, { recursive: true });

const run = (args, { quiet = false } = {}) => {
  const output = execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  if (!quiet) {
    const lines = output.trimEnd().split('\n');
    console.log(lines.slice(0, 8).map((l) => `    ${l}`).join('\n'));
    if (lines.length > 8) console.log(`    … ${lines.length - 8} more lines`);
  }
  return output;
};

section('$ teiqr --help');
run(['--help']);

section('$ teiqr "https://example.com" -o out/11-cli.svg');
run(['https://example.com', '-o', join(OUT, '11-cli.svg')]);

section('$ teiqr "https://example.com" -o out/11-cli.png');
run(['https://example.com', '-o', join(OUT, '11-cli.png')]);

section('$ teiqr "text"  — straight to the terminal');
run(['teiqr from the shell']);

section('$ teiqr types');
run(['types']);

section('$ teiqr scan out/11-cli.png');
run(['scan', join(OUT, '11-cli.png')]);
