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

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'extensions/index': 'src/extensions/index.ts',
    'extensions/starter-kit/index': 'src/extensions/starter-kit/index.ts',
    'extensions/bold/index': 'src/extensions/bold/index.ts',
    'extensions/italic/index': 'src/extensions/italic/index.ts',
    'extensions/underline/index': 'src/extensions/underline/index.ts',
    'extensions/strikethrough/index': 'src/extensions/strikethrough/index.ts',
    'extensions/code/index': 'src/extensions/code/index.ts',
    'extensions/highlight/index': 'src/extensions/highlight/index.ts',
    'extensions/subscript/index': 'src/extensions/subscript/index.ts',
    'extensions/superscript/index': 'src/extensions/superscript/index.ts',
    'extensions/heading/index': 'src/extensions/heading/index.ts',
    'extensions/paragraph/index': 'src/extensions/paragraph/index.ts',
    'extensions/blockquote/index': 'src/extensions/blockquote/index.ts',
    'extensions/horizontal-rule/index': 'src/extensions/horizontal-rule/index.ts',
    'extensions/history/index': 'src/extensions/history/index.ts',
    'extensions/list/index': 'src/extensions/list/index.ts',
    'extensions/link/index': 'src/extensions/link/index.ts',
    'extensions/code-block/index': 'src/extensions/code-block/index.ts',
    'extensions/alignment/index': 'src/extensions/alignment/index.ts',
    'extensions/font-size/index': 'src/extensions/font-size/index.ts',
    'extensions/font-family/index': 'src/extensions/font-family/index.ts',
    'extensions/color/index': 'src/extensions/color/index.ts',
    'extensions/slash-command/index': 'src/extensions/slash-command/index.ts',
    'extensions/drag-handle/index': 'src/extensions/drag-handle/index.ts',
    'extensions/placeholder/index': 'src/extensions/placeholder/index.ts',
    'extensions/turn-into/index': 'src/extensions/turn-into/index.ts',
    'extensions/image/index': 'src/extensions/image/index.ts',
    'extensions/table/index': 'src/extensions/table/index.ts',
    'extensions/embed/index': 'src/extensions/embed/index.ts',
    'extensions/callout/index': 'src/extensions/callout/index.ts',
    'extensions/toggle/index': 'src/extensions/toggle/index.ts',
    'extensions/file/index': 'src/extensions/file/index.ts',
    'extensions/mention/index': 'src/extensions/mention/index.ts',
    'extensions/emoji/index': 'src/extensions/emoji/index.ts',
    'extensions/markdown/index': 'src/extensions/markdown/index.ts',
    'extensions/find-replace/index': 'src/extensions/find-replace/index.ts',
    'extensions/word-count/index': 'src/extensions/word-count/index.ts',
    'extensions/toc/index': 'src/extensions/toc/index.ts',
    'extensions/math/index': 'src/extensions/math/index.ts',
    'extensions/youtube/index': 'src/extensions/youtube/index.ts',
    'extensions/twitter/index': 'src/extensions/twitter/index.ts',
    'extensions/figma/index': 'src/extensions/figma/index.tsx',
    'extensions/page-break/index': 'src/extensions/page-break/index.tsx',
    'extensions/layout/index': 'src/extensions/layout/index.ts',
    'extensions/max-length/index': 'src/extensions/max-length/index.ts',
    'extensions/list-max-indent/index': 'src/extensions/list-max-indent/index.ts',
    'extensions/drag-drop-paste/index': 'src/extensions/drag-drop-paste/index.ts',
    'extensions/datetime/index': 'src/extensions/datetime/index.ts',
    'plugins/index': 'src/plugins/index.ts',
    'themes/index': 'src/themes/index.ts',
    'utils/index': 'src/utils/index.ts',
    'cli/index': 'src/cli/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  external: [
    'react',
    'react-dom',
    'lexical',
    /^@lexical\//,
    'commander',
    'ora',
    'picocolors',
    // Self-ref: registry editors import from '@teispace/teieditor/core' etc.
    // Keep them as externals so Node resolves them via our own exports map at runtime.
    '@teispace/teieditor',
    /^@teispace\/teieditor\//,
  ],
  target: 'es2020',
  outDir: 'dist',
  esbuildPlugins: [collectUseClientOutputs()],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  async onSuccess() {
    await applyUseClientDirective();
  },
});
