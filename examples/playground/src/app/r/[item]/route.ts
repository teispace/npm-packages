import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The shadcn registry, served from the package's build:
 *
 *   npx shadcn@latest add https://<this site>/r/teieditor-bubble-menu.json
 *
 * `/r/index.json` lists the items. The files are the ones
 * `npx @teispace/teieditor add` copies.
 */
function registryDir(): string | null {
  // The installed package, found on disk (a bundler would rewrite `require.resolve`).
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const path = join(dir, 'node_modules/@teispace/teieditor/dist/registry');
    if (existsSync(path)) return path;
    if (dirname(dir) === dir) return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ item: string }> }) {
  const { item } = await params;
  // A name, never a path.
  if (!/^[a-z0-9-]+\.json$/.test(item)) return new Response('Not found', { status: 404 });
  const registry = registryDir();
  if (!registry) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(join(registry, item), 'utf8');
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
