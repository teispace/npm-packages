import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProjectSetup } from '../../src/detection/project.detector';

/**
 * Seed a minimal project on disk. The detector only reads `package.json`
 * and a few directory checks, so we don't need a full template.
 */
async function seedProject(
  root: string,
  opts: {
    deps?: Record<string, string>;
    devDeps?: Record<string, string>;
    dirs?: string[];
  } = {},
): Promise<void> {
  const pkg = {
    name: 'test',
    version: '0.0.0',
    dependencies: opts.deps ?? {},
    devDependencies: opts.devDeps ?? {},
  };
  await writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
  for (const rel of opts.dirs ?? []) {
    await mkdir(path.join(root, rel), { recursive: true });
  }
}

describe('detectProjectSetup — ws', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-detect-ws-'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it("returns 'present' when socket.io-client + src/lib/utils/ws/ both exist", async () => {
    await seedProject(project, {
      deps: { 'socket.io-client': '^4.8.3' },
      dirs: ['src/lib/utils/ws'],
    });
    const result = await detectProjectSetup(project);
    expect(result.ws).toBe('present');
  });

  it("returns 'none' when the dep is present but the directory is missing", async () => {
    // Half-state — bare dep without the ws subtree shouldn't count as installed
    // (otherwise setup/doctor would try to operate on a feature that isn't really there).
    await seedProject(project, {
      deps: { 'socket.io-client': '^4.8.3' },
    });
    const result = await detectProjectSetup(project);
    expect(result.ws).toBe('none');
  });

  it("returns 'none' when the directory exists but the dep is missing", async () => {
    // The directory check is gated behind the dep check, so this is `none`
    // even if the user happens to have left ws/ lying around.
    await seedProject(project, {
      dirs: ['src/lib/utils/ws'],
    });
    const result = await detectProjectSetup(project);
    expect(result.ws).toBe('none');
  });

  it("returns 'none' on a bare project with neither piece", async () => {
    await seedProject(project);
    const result = await detectProjectSetup(project);
    expect(result.ws).toBe('none');
  });

  it('is independent of other detection signals', async () => {
    // ws should report 'present' even when redux/i18n/http are all missing;
    // doctor uses it independently of the others.
    await seedProject(project, {
      deps: { 'socket.io-client': '^4.8.3' },
      dirs: ['src/lib/utils/ws'],
    });
    const result = await detectProjectSetup(project);
    expect(result.ws).toBe('present');
    expect(result.hasRedux).toBe(false);
    expect(result.hasI18n).toBe(false);
    expect(result.httpClient).toBe('none');
  });
});
