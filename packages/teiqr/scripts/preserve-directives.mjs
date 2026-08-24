/**
 * Re-apply the `'use client'` directive that the bundler strips.
 *
 * Rollup — which tsup builds on — hoists module-level directives out of bundled
 * chunks and warns that it ignored them. For most directives that is correct.
 * For `'use client'` it is not: the React Server Components boundary is
 * declared by that exact string appearing at the top of the emitted file, and
 * without it a Next.js App Router consumer importing `teiqr/react` gets
 * "You're importing a component that needs useRef. It only works in a Client
 * Component" — a confusing error pointing at their code, not ours.
 *
 * So the directive is restored here, after bundling, for the entries that need
 * it. This runs as part of `yarn build`; the check in the test suite fails if
 * an entry that should carry the directive does not.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Entry basenames that must be client modules, without extension. */
const CLIENT_ENTRIES = ['react'];

const DIRECTIVE = "'use client';";

/**
 * Insert the directive at the very top of a file.
 *
 * The CJS build opens with its own `'use strict'`, which must stay first —
 * `'use client'` goes immediately after it, since a directive prologue may
 * contain several directives but nothing may precede `'use strict'`.
 */
const applyDirective = (source) => {
  if (source.startsWith(DIRECTIVE) || source.startsWith('"use client"')) return null;

  const strict = /^'use strict';|^"use strict";/.exec(source);
  if (strict) {
    return `${strict[0]}${DIRECTIVE}${source.slice(strict[0].length)}`;
  }
  return `${DIRECTIVE}${source}`;
};

let changed = 0;
const checked = [];

for (const entry of CLIENT_ENTRIES) {
  for (const extension of ['js', 'cjs']) {
    const path = join(DIST, `${entry}.${extension}`);
    let source;
    try {
      source = await readFile(path, 'utf8');
    } catch {
      throw new Error(
        `preserve-directives: expected ${entry}.${extension} in dist, but it is missing. ` +
          'Did the tsup entry list change?',
      );
    }

    const updated = applyDirective(source);
    if (updated !== null) {
      await writeFile(path, updated);
      changed++;
    }
    checked.push({ path, entry, extension });
  }
}

// Verify rather than trust. A silent failure here surfaces much later, as a
// confusing Next.js error in somebody else's application.
for (const { path, entry, extension } of checked) {
  const final = await readFile(path, 'utf8');
  const prologue = final.slice(0, 64);
  if (!prologue.includes('use client')) {
    throw new Error(
      `preserve-directives: ${entry}.${extension} does not begin with a 'use client' directive. ` +
        'Next.js App Router consumers would fail to import it.',
    );
  }
}

console.log(
  `preserve-directives: 'use client' applied to ${changed} file(s), verified on ${checked.length}`,
);
