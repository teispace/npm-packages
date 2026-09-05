import { describe, expect, it } from 'vitest';
import { isFeatureOn, resolveAnswers, validateManifest } from '../../src/composition/manifest';

const manifest = validateManifest({
  manifestVersion: 1,
  starter: { name: 's', version: '2.0.0' },
  options: {
    state: { type: 'choice', values: ['redux', 'zustand', 'none'], default: 'redux' },
    ws: { type: 'boolean', default: false, requires: { state: ['redux'] } },
    tests: { type: 'boolean', default: true },
    e2e: { type: 'boolean', default: true, requires: { tests: [true] } },
    communityFiles: { type: 'multi', values: ['A.md', 'B.md'], default: [] },
  },
  features: {
    redux: { when: { state: ['redux'] } },
    ws: { when: { ws: [true] } },
    a: { when: { communityFiles: ['A.md'] } },
  },
  packageManagers: { pnpm: { lockfile: 'pnpm-lock.yaml' } },
});

describe('validateManifest', () => {
  it('rejects unsupported versions and unknown option references', () => {
    expect(() => validateManifest({ manifestVersion: 2 })).toThrow(/manifestVersion/);
    expect(() =>
      validateManifest({
        manifestVersion: 1,
        starter: { name: 's', version: '1' },
        options: {},
        features: { x: { when: { nope: [true] } } },
        packageManagers: {},
      }),
    ).toThrow(/unknown option nope/);
  });
});

describe('resolveAnswers', () => {
  it('fills defaults and coerces string flags', () => {
    const { answers, unknown } = resolveAnswers(manifest, {
      ws: 'true',
      communityFiles: 'A.md,B.md',
      bogus: 1,
    });
    expect(answers).toEqual({
      state: 'redux',
      ws: true,
      tests: true,
      e2e: true,
      communityFiles: ['A.md', 'B.md'],
    });
    expect(unknown).toEqual(['bogus']);
  });

  it('forces dependent options off when their requirement fails', () => {
    const { answers, forced } = resolveAnswers(manifest, {
      state: 'zustand',
      ws: true,
      tests: false,
    });
    expect(answers.ws).toBe(false);
    expect(answers.e2e).toBe(false);
    expect(forced.map((f) => f.option)).toEqual(['ws', 'e2e']);
  });

  it('rejects invalid values', () => {
    expect(() => resolveAnswers(manifest, { state: 'mobx' })).toThrow(/does not accept mobx/);
    expect(() => resolveAnswers(manifest, { ws: 'maybe' })).toThrow(/expects true or false/);
  });
});

describe('isFeatureOn', () => {
  it('evaluates choice, boolean, and multi conditions', () => {
    const { answers } = resolveAnswers(manifest, { communityFiles: ['B.md'] });
    expect(isFeatureOn(manifest, manifest.features.redux, answers)).toBe(true);
    expect(isFeatureOn(manifest, manifest.features.ws, answers)).toBe(false);
    expect(isFeatureOn(manifest, manifest.features.a, answers)).toBe(false);
    expect(
      isFeatureOn(manifest, manifest.features.a, { ...answers, communityFiles: ['A.md'] }),
    ).toBe(true);
  });
});

describe('loadStarterManifest', () => {
  it('takes the version from the starter package.json over the manifest copy', async () => {
    const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { loadStarterManifest } = await import('../../src/composition/manifest');
    const dir = await mkdtemp(path.join(tmpdir(), 'nm-manifest-'));
    try {
      const manifest = {
        manifestVersion: 1,
        starter: { name: '@teispace/nextjs-starter', version: '2.0.0-alpha.0' },
        options: {},
        features: {},
        packageManagers: {},
      };
      await writeFile(path.join(dir, 'next-maker.json'), JSON.stringify(manifest));
      expect((await loadStarterManifest(dir)).starter.version).toBe('2.0.0-alpha.0');
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ version: '2.0.0-alpha.1' }));
      expect((await loadStarterManifest(dir)).starter.version).toBe('2.0.0-alpha.1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
