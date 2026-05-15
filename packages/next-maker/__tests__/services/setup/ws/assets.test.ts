import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyWsFiles, stripWsTestArtifacts } from '../../../../src/services/setup/ws/assets';

/**
 * Seed a minimal fake nextjs-starter template at `root`. Only the files
 * `copyWsFiles` actually reads — the shape is the contract this test is
 * locking in.
 */
async function writeFakeTemplate(root: string): Promise<void> {
  const write = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  };

  // src/lib/utils/ws — full subtree
  await write('src/lib/utils/ws/index.ts', '// stub ws barrel\n');
  await write('src/lib/utils/ws/constants.ts', '// stub constants\n');
  await write('src/lib/utils/ws/README.md', '# ws stub\n');

  await write('src/lib/utils/ws/types/events.ts', '// stub events\n');
  await write('src/lib/utils/ws/types/index.ts', "export * from './events';\n");

  await write('src/lib/utils/ws/shared/runtime.ts', '// stub runtime\n');
  await write('src/lib/utils/ws/shared/ws-url.ts', '// stub ws-url\n');
  await write('src/lib/utils/ws/shared/index.ts', '// stub shared barrel\n');
  await write('src/lib/utils/ws/shared/runtime.test.ts', '// runtime test\n');

  await write('src/lib/utils/ws/client/ws-client.ts', '// stub ws-client\n');
  await write('src/lib/utils/ws/client/client.ts', '// stub lazy proxy\n');
  await write('src/lib/utils/ws/client/index.ts', '// stub client barrel\n');
  await write('src/lib/utils/ws/client/ws-client.test.ts', '// client test\n');

  await write('src/lib/utils/ws/redux/bridge.ts', '// stub bridge\n');
  await write('src/lib/utils/ws/redux/selectors.ts', '// stub selectors\n');
  await write('src/lib/utils/ws/redux/index.ts', '// stub redux barrel\n');
  await write('src/lib/utils/ws/redux/bridge.test.ts', '// bridge test\n');

  await write('src/lib/utils/ws/hooks/use-ws-status.ts', '// stub\n');
  await write('src/lib/utils/ws/hooks/index.ts', '// stub hooks barrel\n');
  await write('src/lib/utils/ws/hooks/use-ws-status.test.tsx', '// hook test\n');

  await write('src/lib/utils/ws/__test-utils__/fake-socket.ts', '// fake socket\n');

  // src/store/slices/ws.slice.ts
  await write('src/store/slices/ws.slice.ts', 'export const wsReducer = () => ({}) as any;\n');
}

describe('copyWsFiles', () => {
  let template: string;
  let project: string;

  beforeEach(async () => {
    template = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-template-'));
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-project-'));
    await writeFakeTemplate(template);
  });

  afterEach(async () => {
    await rm(template, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  it('copies the full ws subtree when keepTests=true', async () => {
    await copyWsFiles(project, template, { keepTests: true });

    const expected = [
      'src/lib/utils/ws/index.ts',
      'src/lib/utils/ws/constants.ts',
      'src/lib/utils/ws/types/events.ts',
      'src/lib/utils/ws/shared/runtime.ts',
      'src/lib/utils/ws/shared/ws-url.ts',
      'src/lib/utils/ws/client/ws-client.ts',
      'src/lib/utils/ws/client/client.ts',
      'src/lib/utils/ws/redux/bridge.ts',
      'src/lib/utils/ws/redux/selectors.ts',
      'src/lib/utils/ws/hooks/use-ws-status.ts',
      // Tests preserved
      'src/lib/utils/ws/shared/runtime.test.ts',
      'src/lib/utils/ws/client/ws-client.test.ts',
      'src/lib/utils/ws/redux/bridge.test.ts',
      'src/lib/utils/ws/hooks/use-ws-status.test.tsx',
      // __test-utils__ preserved
      'src/lib/utils/ws/__test-utils__/fake-socket.ts',
    ];
    for (const rel of expected) {
      expect(existsSync(path.join(project, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it('copies the slice to src/store/slices/ws.slice.ts', async () => {
    await copyWsFiles(project, template, { keepTests: true });

    const slice = await readFile(path.join(project, 'src/store/slices/ws.slice.ts'), 'utf-8');
    expect(slice).toContain('wsReducer');
  });

  it('strips *.test.ts(x) files and __test-utils__/ when keepTests=false', async () => {
    await copyWsFiles(project, template, { keepTests: false });

    // Source files survive
    expect(existsSync(path.join(project, 'src/lib/utils/ws/client/ws-client.ts'))).toBe(true);
    expect(existsSync(path.join(project, 'src/lib/utils/ws/redux/bridge.ts'))).toBe(true);

    // Tests gone
    expect(existsSync(path.join(project, 'src/lib/utils/ws/shared/runtime.test.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/lib/utils/ws/client/ws-client.test.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/lib/utils/ws/redux/bridge.test.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/lib/utils/ws/hooks/use-ws-status.test.tsx'))).toBe(
      false,
    );
    expect(existsSync(path.join(project, 'src/lib/utils/ws/__test-utils__'))).toBe(false);
  });
});

describe('stripWsTestArtifacts (pure)', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'next-maker-ws-strip-'));
    await mkdir(path.join(scratch, 'shared'), { recursive: true });
    await writeFile(path.join(scratch, 'shared/runtime.ts'), '// stub\n');
    await writeFile(path.join(scratch, 'shared/runtime.test.ts'), '// test\n');
    await mkdir(path.join(scratch, '__test-utils__'), { recursive: true });
    await writeFile(path.join(scratch, '__test-utils__/fake.ts'), '// fake\n');
    await writeFile(path.join(scratch, 'hooks.test.tsx'), '// tsx test\n');
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('removes test files and __test-utils__/ recursively', async () => {
    await stripWsTestArtifacts(scratch);

    expect(existsSync(path.join(scratch, 'shared/runtime.ts'))).toBe(true);
    expect(existsSync(path.join(scratch, 'shared/runtime.test.ts'))).toBe(false);
    expect(existsSync(path.join(scratch, '__test-utils__'))).toBe(false);
    expect(existsSync(path.join(scratch, 'hooks.test.tsx'))).toBe(false);
  });
});
