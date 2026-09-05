import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectPrompts } from '../../../../src/prompts/create-app.prompt';
import {
  cleanupTests,
  removeColocatedTests,
} from '../../../../src/services/init/cleanup/tests.cleanup';

const answers = (tests: boolean): ProjectPrompts =>
  ({ tests, redux: true, i18n: true, ws: false, httpClient: 'fetch' }) as ProjectPrompts;

const files = [
  'src/lib/utils/http/fetch-client/fetch-client.ts',
  'src/lib/utils/http/fetch-client/fetch-client.test.ts',
  'src/lib/utils/ws/hooks/use-ws-event.test.tsx',
  'src/lib/utils/ws/__test-utils__/fake-socket.ts',
  'src/store/slices/ws.slice.test.ts',
  'src/features/counter/components/Counter.test.tsx',
  'src/proxy.test.ts',
  'src/lib/config/seo.spec.ts',
  'test/setup.ts',
  'vitest.config.ts',
];

const makeProject = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'nm-tests-cleanup-'));
  for (const rel of files) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), '// fixture\n');
  }
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        test: 'vitest run',
        'test:watch': 'vitest',
        'test:coverage': 'vitest run --coverage',
        validate:
          'yarn ci:check && yarn type-check && yarn check:deprecated && yarn test && yarn build',
      },
      devDependencies: { vitest: '^4', jsdom: '^29' },
    }),
  );
  return root;
};

let project: string;
afterEach(async () => {
  if (project) await rm(project, { recursive: true, force: true });
});

describe('removeColocatedTests', () => {
  it('deletes every *.test / *.spec file and test-util directory under the root, keeping sources', async () => {
    project = await makeProject();
    await removeColocatedTests(path.join(project, 'src'));

    expect(existsSync(path.join(project, 'src/lib/utils/http/fetch-client/fetch-client.ts'))).toBe(
      true,
    );
    for (const rel of files.filter(
      (f) => f.startsWith('src/') && /(\.(test|spec)\.tsx?$|__test-utils__)/.test(f),
    )) {
      expect(existsSync(path.join(project, rel)), rel).toBe(false);
    }
  });

  it('is a no-op on a missing directory', async () => {
    await expect(removeColocatedTests('/definitely/not/here')).resolves.toBeUndefined();
  });
});

describe('cleanupTests', () => {
  it('is a no-op when tests are kept', async () => {
    project = await makeProject();
    await cleanupTests(project, answers(true));
    expect(existsSync(path.join(project, 'vitest.config.ts'))).toBe(true);
    expect(existsSync(path.join(project, 'src/store/slices/ws.slice.test.ts'))).toBe(true);
  });

  it('removes config, the test dir, every co-located test, and the scripts when tests are off', async () => {
    project = await makeProject();
    await cleanupTests(project, answers(false));

    expect(existsSync(path.join(project, 'vitest.config.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'test'))).toBe(false);
    expect(existsSync(path.join(project, 'src/store/slices/ws.slice.test.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/proxy.test.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/lib/utils/ws/__test-utils__'))).toBe(false);

    const pkg = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        path.join(project, 'package.json'),
        'utf-8',
      ),
    );
    expect(pkg.scripts.test).toBeUndefined();
    expect(pkg.scripts.validate).toBe(
      'yarn ci:check && yarn type-check && yarn check:deprecated && yarn build',
    );
    expect(pkg.devDependencies.vitest).toBeUndefined();
  });
});
