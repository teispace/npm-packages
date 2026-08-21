import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { httpClientManifest } from '../../src/manifests/http-client.manifest';
import { checkManifest } from '../../src/manifests/runner';

/**
 * Bug 1 regression suite.
 *
 * The http-client manifest lists the bundle-sentinel mount with two possible
 * homes: `src/app/[locale]/layout.tsx` (i18n installed) and
 * `src/app/layout.tsx` (not). Exactly one of them ever exists, and the
 * checker used to count the absent one as a missing injection — so a
 * perfectly healthy project reported permanent drift, `doctor` exited 1, and
 * the documented `doctor --json` CI gate could never pass.
 */

const PROJECT_ROOT_LAYOUT = 'src/app/layout.tsx';

let projectPath: string;

beforeEach(async () => {
  projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-http-manifest-'));
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

const write = async (rel: string, content: string) => {
  await mkdir(path.dirname(path.join(projectPath, rel)), { recursive: true });
  await writeFile(path.join(projectPath, rel), content);
};

/** Lay down the complete, healthy http-client footprint. */
const seedHealthyProject = async (layout: 'root' | 'locale') => {
  await write('package.json', JSON.stringify({ dependencies: {}, devDependencies: {} }, null, 2));
  await write('src/lib/utils/http/index.ts', 'export {};');
  await write('src/lib/utils/http/fetch-client/index.ts', 'export const fetchClient = {};');
  await write('src/lib/utils/http/shared/index.ts', 'export {};');
  await write('src/lib/utils/http/server.ts', 'export {};');
  await write('src/lib/utils/http/__bundle-sentinel__/client-bundle-sentinel.tsx', 'export {};');
  await write('src/lib/config/api-url.ts', 'export const getApiBaseUrl = () => "";');

  const layoutRel = layout === 'locale' ? 'src/app/[locale]/layout.tsx' : PROJECT_ROOT_LAYOUT;
  await write(
    layoutRel,
    'export default () => <RootProvider><HttpClientBundleSentinel /></RootProvider>;',
  );
  return layoutRel;
};

describe('httpClientManifest sentinel injection', () => {
  it('reports no drift for a non-i18n project (only src/app/layout.tsx exists)', async () => {
    await seedHealthyProject('root');

    const result = await checkManifest(httpClientManifest, projectPath);

    expect(result.installed).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it('reports no drift for an i18n project (only [locale]/layout.tsx exists)', async () => {
    await seedHealthyProject('locale');

    const result = await checkManifest(httpClientManifest, projectPath);

    expect(result.installed).toBe(true);
    expect(result.drift).toEqual([]);
  });

  it('still reports drift when the mount is genuinely missing', async () => {
    await seedHealthyProject('root');
    await write(PROJECT_ROOT_LAYOUT, 'export default () => <RootProvider />;');

    const result = await checkManifest(httpClientManifest, projectPath);

    expect(result.drift).toEqual([
      {
        kind: 'missingInjection',
        file: PROJECT_ROOT_LAYOUT,
        description: '<HttpClientBundleSentinel /> mount in the app layout',
      },
    ]);
  });

  it('declares the mount once, with the alternative layout as an alternative path', () => {
    expect(httpClientManifest.injections).toHaveLength(1);
    expect(httpClientManifest.injections[0].alternativeFiles).toEqual([PROJECT_ROOT_LAYOUT]);
  });
});
