import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    server: 'src/server.ts',
    adapters: 'src/adapters.ts',
    script: 'src/script.ts',
    tailwind: 'src/tailwind.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  external: ['react', 'react-dom', 'next', 'next/navigation', 'next/headers'],
  target: 'es2020',
  outDir: 'dist',
  // Disable esbuild's `keepNames` to prevent `__name(fn,"name")` wrappers
  // from being emitted into the bundle. The inline anti-FOUC script must
  // not reference any global helper — `__name` would crash on the client.
  keepNames: false,
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.keepNames = false;
  },
  onSuccess: async () => {
    const distDir = join(process.cwd(), 'dist');
    if (!existsSync(distDir)) return;

    // Pass 1: prepend `'use client';` to the entries whose public surface
    // exposes hooks/providers/components. This lets consumers import our
    // `ThemeProvider`, `useTheme`, `<ThemedImage>`, etc. directly into a
    // server file without needing to write their own `'use client'`
    // wrapper. The /server, /adapters, /script, /tailwind entries stay
    // free of the directive — they are universal/server-safe.
    const CLIENT_ENTRIES = ['index.js', 'client.js'];
    for (const name of CLIENT_ENTRIES) {
      const path = join(distDir, name);
      if (!existsSync(path)) continue;
      const original = readFileSync(path, 'utf8');
      if (original.startsWith("'use client'") || original.startsWith('"use client"')) continue;
      writeFileSync(path, `'use client';\n${original}`);
    }

    // Pass 2: belt-and-braces — fail the build if any `__name(` leaks
    // into the JS output. The inline anti-FOUC script must not reference
    // any global helper; `__name` would crash on the client.
    const offenders: string[] = [];
    for (const name of readdirSync(distDir)) {
      if (!name.endsWith('.js')) continue;
      const contents = readFileSync(join(distDir, name), 'utf8');
      if (/__name\(/.test(contents)) offenders.push(name);
    }
    if (offenders.length > 0) {
      throw new Error(
        `[next-themes] Built output contains \`__name(\` wrappers in: ${offenders.join(', ')}. ` +
          `This will crash the inline anti-FOUC script in the browser. ` +
          `Check tsup/esbuild config and ensure keepNames is disabled.`,
      );
    }

    // Pass 3: sanity — server entry must not have `'use client'`,
    // otherwise users importing `getTheme()` get pulled into the client
    // bundle and lose access to `next/headers`.
    const serverPath = join(distDir, 'server.js');
    if (existsSync(serverPath)) {
      const c = readFileSync(serverPath, 'utf8');
      if (c.startsWith("'use client'") || c.startsWith('"use client"')) {
        throw new Error(
          '[next-themes] dist/server.js starts with `use client` — this entry must stay server-safe.',
        );
      }
    }
  },
});
