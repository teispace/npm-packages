import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'esbuild';
import { defineConfig } from 'tsup';

const DIRECTIVE_RE = /^\s*(['"])use client\1/;
// Kept OUTSIDE dist so a failed build can never leave it in the published
// package (dist is shipped wholesale via package.json "files").
const SIDECAR = path.resolve('node_modules/.cache/tei-use-client-outputs.json');

/**
 * esbuild strips the `'use client'` directive when bundling, and any later
 * re-bundle pass strips it again — so we can't fix this purely inside esbuild.
 * Instead this runs in two phases:
 *
 *   1. An esbuild plugin reads the build metafile (outputs → inputs) and records
 *      which output `.js` chunks came from at least one `'use client'` source,
 *      writing that list to a sidecar JSON.
 *   2. tsup's `onSuccess` (below) runs AFTER all files are written to disk and
 *      no further bundling occurs; it prepends the directive to exactly those
 *      files, then removes the sidecar.
 *
 * Client and CLI/server code live in separate chunks (the CLI imports no
 * React), so no server-only output is ever mislabeled.
 */
function collectUseClientOutputs(): Plugin {
  return {
    name: 'collect-use-client-outputs',
    setup(build) {
      build.initialOptions.metafile = true;
      const sourceHasDirective = new Map<string, boolean>();

      build.onEnd(async (result) => {
        const outputs = result.metafile?.outputs;
        if (!outputs) return;

        // Pass 1: an output is "client" if any of its own source inputs declared
        // the directive.
        const client = new Set<string>();
        for (const [outFile, meta] of Object.entries(outputs)) {
          if (!outFile.endsWith('.js')) continue;
          for (const input of Object.keys(meta.inputs)) {
            if (!/\.(t|j)sx?$/.test(input)) continue;
            let cached = sourceHasDirective.get(input);
            if (cached === undefined) {
              try {
                cached = DIRECTIVE_RE.test(await readFile(input, 'utf8'));
              } catch {
                cached = false;
              }
              sourceHasDirective.set(input, cached);
            }
            if (cached) {
              client.add(outFile);
              break;
            }
          }
        }

        // Pass 2: propagate up the import graph — an entry that re-exports from a
        // client chunk (code-splitting moves the client source into the chunk,
        // leaving the entry's own inputs directive-free) is itself a client
        // module and must carry the directive for Next.js to resolve it as one.
        let changed = true;
        while (changed) {
          changed = false;
          for (const [outFile, meta] of Object.entries(outputs)) {
            if (!outFile.endsWith('.js') || client.has(outFile)) continue;
            for (const imp of meta.imports ?? []) {
              if (imp.path && client.has(imp.path)) {
                client.add(outFile);
                changed = true;
                break;
              }
            }
          }
        }

        const clientOutputs = Array.from(client, (o) => path.resolve(o));
        // Merge across esbuild passes rather than overwrite.
        let existing: string[] = [];
        try {
          existing = JSON.parse(await readFile(SIDECAR, 'utf8'));
        } catch {
          /* first pass */
        }
        const merged = Array.from(new Set([...existing, ...clientOutputs]));
        await mkdir(path.dirname(SIDECAR), { recursive: true });
        await writeFile(SIDECAR, JSON.stringify(merged));
      });
    },
  };
}

/** Phase 2: prepend the directive to recorded client outputs, on disk. */
async function applyUseClientDirective(): Promise<void> {
  let files: string[];
  try {
    files = JSON.parse(await readFile(SIDECAR, 'utf8'));
  } catch {
    return; // nothing recorded
  }
  await Promise.all(
    files.map(async (file) => {
      try {
        const code = await readFile(file, 'utf8');
        if (DIRECTIVE_RE.test(code)) return;
        await writeFile(file, `'use client';\n${code}`);
      } catch {
        /* output may not exist (e.g. cleaned) — skip */
      }
    }),
  );
  await rm(SIDECAR, { force: true });
}

/**
 * One entry per public subpath, found from the folder layout so a new
 * extension is published by creating its folder: `src/extensions/<name>/index.ts`
 * becomes `@teispace/teieditor/extensions/<name>`.
 */
function entries(): Record<string, string> {
  const found: Record<string, string> = { index: 'src/index.ts' };
  for (const dir of ['extensions']) {
    for (const name of readdirSync(path.join('src', dir))) {
      for (const file of ['index.ts', 'index.tsx']) {
        const source = path.join('src', dir, name, file);
        if (existsSync(source)) found[`${dir}/${name}/index`] = source;
      }
    }
  }
  for (const single of ['react', 'icons', 'server', 'cli']) {
    for (const file of ['index.ts', 'index.tsx']) {
      const source = path.join('src', single, file);
      if (existsSync(source)) found[`${single}/index`] = source;
    }
  }
  return found;
}

export default defineConfig({
  entry: entries(),
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  minify: true,
  sourcemap: false,
  // Every dependency and peer stays external: Lexical must be one instance
  // per app, and the app's bundler dedupes the rest.
  external: [
    /^react($|\/)/,
    /^react-dom($|\/)/,
    'lexical',
    /^@lexical\//,
    /^@floating-ui\//,
    'yjs',
    'katex',
    /^@excalidraw\//,
    /^shiki/,
  ],
  target: 'es2022',
  outDir: 'dist',
  esbuildPlugins: [collectUseClientOutputs()],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  async onSuccess() {
    await applyUseClientDirective();
  },
});
