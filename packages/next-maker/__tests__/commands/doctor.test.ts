import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The command module logs through `../config`; silence it.
vi.mock('../../src/config', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  spinner: { fail: vi.fn(), succeed: vi.fn(), start: vi.fn(), stop: vi.fn() },
}));

const { applyFixes } = await import('../../src/commands/doctor');
const { checkManifest } = await import('../../src/manifests/runner');
type FeatureManifest = import('../../src/manifests/types').FeatureManifest;
type FeatureFinding = import('../../src/manifests/types').FeatureFinding;

let projectPath: string;

beforeEach(async () => {
  projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-doctor-'));
  await writeFile(
    path.join(projectPath, 'package.json'),
    `${JSON.stringify({ scripts: {}, dependencies: {}, devDependencies: {} }, null, 2)}\n`,
  );
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

/**
 * A manifest whose only footprint is a `demo` script, so a "repair" is just
 * writing that script into package.json.
 */
const scriptManifest = (overrides: Partial<FeatureManifest> = {}): FeatureManifest => ({
  id: 'demo',
  name: 'Demo',
  description: 'demo feature',
  detect: async () => true,
  files: [],
  packages: [],
  scripts: [{ name: 'demo', expectedValue: 'echo demo' }],
  injections: [],
  ...overrides,
});

const writeScript = async (name: string, value: string) => {
  const pkgPath = path.join(projectPath, 'package.json');
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(pkgPath, 'utf-8'));
  pkg.scripts = { ...pkg.scripts, [name]: value };
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

describe('applyFixes', () => {
  it('reports FIXED only when a re-check confirms the drift is gone', async () => {
    const manifest = scriptManifest({
      apply: async (_p, drift) => {
        expect(drift).toEqual([{ kind: 'missingScript', name: 'demo', expected: 'echo demo' }]);
        await writeScript('demo', 'echo demo');
      },
    });

    const before = await checkManifest(manifest, projectPath);
    expect(before.drift).toHaveLength(1);

    const outcomes = await applyFixes([before], projectPath);

    expect(outcomes).toEqual([
      { id: 'demo', name: 'Demo', status: 'fixed', remaining: [], error: undefined },
    ]);
  });

  it('reports STILL DRIFTED when apply silently does nothing', async () => {
    // This is the exact old failure mode: every setup service opened with a
    // first-run guard that fired on an installed feature, printed
    // `spinner.fail()` and returned — and doctor called it success.
    const apply = vi.fn(async () => {});
    const manifest = scriptManifest({ apply });

    const before = await checkManifest(manifest, projectPath);
    const outcomes = await applyFixes([before], projectPath);

    expect(apply).toHaveBeenCalledOnce();
    expect(outcomes[0].status).toBe('stillDrifted');
    expect(outcomes[0].remaining).toHaveLength(1);
  });

  it('passes the computed drift into apply so it takes the repair path', async () => {
    const apply = vi.fn(async () => {});
    const manifest = scriptManifest({ apply });

    const before = await checkManifest(manifest, projectPath);
    await applyFixes([before], projectPath);

    expect(apply).toHaveBeenCalledWith(projectPath, before.drift);
  });

  it('reports NO AUTOMATIC FIX AVAILABLE when the manifest has no apply', async () => {
    const manifest = scriptManifest({ apply: undefined });

    const before = await checkManifest(manifest, projectPath);
    const outcomes = await applyFixes([before], projectPath);

    expect(outcomes[0].status).toBe('noApply');
    expect(outcomes[0].remaining).toEqual(before.drift);
  });

  it('records a thrown repair as still drifted instead of swallowing it', async () => {
    const manifest = scriptManifest({
      apply: async () => {
        throw new Error('degit exploded');
      },
    });

    const before = await checkManifest(manifest, projectPath);
    const outcomes = await applyFixes([before], projectPath);

    expect(outcomes[0].status).toBe('stillDrifted');
    expect(outcomes[0].error).toBe('degit exploded');
  });

  it('never reports fixed when a repair only half-succeeds', async () => {
    const manifest = scriptManifest({
      scripts: [
        { name: 'demo', expectedValue: 'echo demo' },
        { name: 'other', expectedValue: 'echo other' },
      ],
      apply: async () => {
        await writeScript('demo', 'echo demo');
      },
    });

    const before = await checkManifest(manifest, projectPath);
    const outcomes = await applyFixes([before], projectPath);

    expect(outcomes[0].status).toBe('stillDrifted');
    expect(outcomes[0].remaining).toEqual([
      { kind: 'missingScript', name: 'other', expected: 'echo other' },
    ]);
  });

  it('keeps going after one feature fails', async () => {
    const failing = scriptManifest({
      id: 'a',
      name: 'A',
      apply: async () => {
        throw new Error('nope');
      },
    });
    const healing = scriptManifest({
      id: 'b',
      name: 'B',
      apply: async () => {
        await writeScript('demo', 'echo demo');
      },
    });

    const results = [
      await checkManifest(failing, projectPath),
      await checkManifest(healing, projectPath),
    ];
    const outcomes = await applyFixes(results, projectPath);

    expect(outcomes.map((o) => o.status)).toEqual(['stillDrifted', 'fixed']);
  });
});

describe('every registered manifest advertises a repair path', () => {
  it('accepts the drift argument, so --fix can never fall back to the installer', async () => {
    const { MANIFESTS } = await import('../../src/manifests');

    for (const manifest of MANIFESTS) {
      expect(manifest.apply, `${manifest.id} has no apply()`).toBeTypeOf('function');
      // A raw `setupX` has arity 1 and would ignore the drift entirely (the
      // original bug). A `withRepair(...)` wrapper has arity 2.
      expect(manifest.apply?.length, `${manifest.id}.apply ignores drift`).toBe(2);
    }
  });
});
