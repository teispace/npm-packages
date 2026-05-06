import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { detectAppDir, detectPwa } from '../../../src/services/favicon/detect';

const tmpRoots: string[] = [];

const mktmp = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'next-maker-favicon-detect-'));
  tmpRoots.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(tmpRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('detectAppDir', () => {
  it('returns null when no app dir exists', async () => {
    const dir = await mktmp();
    expect(await detectAppDir(dir)).toBeNull();
  });

  it('prefers src/app over app', async () => {
    const dir = await mktmp();
    await mkdir(path.join(dir, 'src', 'app'), { recursive: true });
    await mkdir(path.join(dir, 'app'), { recursive: true });
    expect(await detectAppDir(dir)).toBe(path.join(dir, 'src', 'app'));
  });

  it('falls back to app/', async () => {
    const dir = await mktmp();
    await mkdir(path.join(dir, 'app'), { recursive: true });
    expect(await detectAppDir(dir)).toBe(path.join(dir, 'app'));
  });
});

describe('detectPwa', () => {
  it('returns isPwa=false for empty project', async () => {
    const dir = await mktmp();
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf-8');
    const pwa = await detectPwa(dir);
    expect(pwa.isPwa).toBe(false);
  });

  it('detects public/manifest.json', async () => {
    const dir = await mktmp();
    await mkdir(path.join(dir, 'public'), { recursive: true });
    await writeFile(path.join(dir, 'public', 'manifest.json'), '{}', 'utf-8');
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({}), 'utf-8');
    const pwa = await detectPwa(dir);
    expect(pwa.isPwa).toBe(true);
    expect(pwa.publicManifestPath).toBe(path.join(dir, 'public', 'manifest.json'));
  });

  it('detects typed manifest.ts in src/app', async () => {
    const dir = await mktmp();
    await mkdir(path.join(dir, 'src', 'app'), { recursive: true });
    await writeFile(path.join(dir, 'src', 'app', 'manifest.ts'), 'export default {}', 'utf-8');
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({}), 'utf-8');
    const pwa = await detectPwa(dir);
    expect(pwa.isPwa).toBe(true);
    expect(pwa.appManifestPath).toBe(path.join(dir, 'src', 'app', 'manifest.ts'));
  });

  it('detects PWA framework via package.json deps', async () => {
    const dir = await mktmp();
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { '@serwist/next': '^9.0.0' },
      }),
      'utf-8',
    );
    const pwa = await detectPwa(dir);
    expect(pwa.isPwa).toBe(true);
    expect(pwa.framework).toBe('@serwist/next');
  });
});
