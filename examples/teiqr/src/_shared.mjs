/** Small helpers the examples share, so each one stays about teiqr. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OUT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'out');

/** Write a file into `out/`, creating it on first use, and log what happened. */
export const save = (name, contents) => {
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, name);
  writeFileSync(path, contents);
  const size = typeof contents === 'string' ? Buffer.byteLength(contents) : contents.length;
  console.log(`    wrote out/${name} (${size.toLocaleString()} bytes)`);
  return path;
};

/** A heading, so `run-all` output stays readable. */
export const section = (title) => console.log(`\n  ${title}`);

/** Assert inside an example, so a broken example fails loudly rather than lying. */
export const check = (condition, message) => {
  if (!condition) throw new Error(`Example check failed: ${message}`);
};
