#!/usr/bin/env node
/**
 * The `teiqr` executable.
 *
 * A thin shim: it supplies the filesystem and streams, then hands off to
 * {@link run}, which is a pure function over argv. Keeping the Node-specific
 * parts here is what lets the whole command surface be tested in-process
 * without spawning anything.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { type CliIo, run } from './cli/run.js';

const io: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readFile: async (path) => new Uint8Array(await readFile(path)),
  writeFile: (path, data) => writeFile(path, data),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
};

// Deliberately not top-level await: the package also emits a CommonJS build,
// and CJS has no top-level await, so using it here fails the whole build.
//
// `process.exitCode` rather than `process.exit`, so buffered stdout is flushed
// before the process ends — `process.exit` truncates output when stdout is a
// pipe, which is exactly how a CLI is used in a script.
run(process.argv.slice(2), io)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // `run` handles its own errors, so reaching here means a genuine defect.
    process.stderr.write(`teiqr: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
