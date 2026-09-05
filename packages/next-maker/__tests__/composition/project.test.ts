import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listFiles } from '../../src/composition/glob';
import { loadStarterManifest } from '../../src/composition/manifest';
import {
  applyReconfigure,
  checkProject,
  featureFootprint,
  type ProjectRecord,
  planReconfigure,
  type StarterCheckout,
  writeProjectRecord,
} from '../../src/composition/project';

const manifest = {
  manifestVersion: 1,
  starter: { name: 's', version: '2.0.0' },
  options: {
    state: { type: 'choice', values: ['redux', 'zustand', 'none'], default: 'redux' },
    ws: { type: 'boolean', default: false, requires: { state: ['redux'] } },
    tests: { type: 'boolean', default: true },
  },
  always: { remove: ['next-maker.json', '.next-maker/**'] },
  features: {
    redux: { when: { state: ['redux'] }, off: { remove: ['src/store/**'], packages: ['redux'] } },
    zustand: {
      when: { state: ['zustand'] },
      on: { overlay: 'zustand' },
      off: { packages: ['zustand'] },
    },
    ws: {
      when: { ws: [true] },
      off: {
        remove: ['src/lib/ws/**'],
        anchors: ['ws'],
        packages: ['socket.io-client'],
        unwrapJsx: [{ file: 'src/providers/StoreProvider.tsx', tag: 'WsBridge' }],
      },
    },
    tests: {
      when: { tests: [true] },
      off: { remove: ['**/*.test.ts'], devPackages: ['vitest'], scripts: ['test'] },
    },
  },
  packageManagers: { pnpm: { lockfile: 'pnpm-lock.yaml' } },
};

const starterFiles: Record<string, string> = {
  'next-maker.json': JSON.stringify(manifest),
  'package.json': JSON.stringify({
    scripts: { test: 'vitest run' },
    dependencies: { redux: '^5', zustand: '^5', 'socket.io-client': '^4' },
    devDependencies: { vitest: '^5' },
  }),
  'src/store/index.ts': 'redux store',
  'src/store/index.test.ts': 'redux test',
  'src/lib/ws/client.ts': 'ws',
  'src/lib/ws/client.test.ts': 'ws test',
  'src/store/rootReducer.ts': [
    '// @next-maker:ws',
    "import { wsSlice } from './ws';",
    'combineSlices(',
    '  a,',
    '  // @next-maker:ws',
    '  wsSlice,',
    ')',
  ].join('\n'),
  'src/providers/StoreProvider.tsx': [
    'export const P = () => (',
    '  <WsBridge>',
    '    <x />',
    '  </WsBridge>',
    ');',
  ].join('\n'),
  '.next-maker/overlays/zustand/src/store/index.ts': 'zustand store',
};

let starterDir: string;
let projectDir: string;
let checkout: StarterCheckout;

const write = async (root: string, files: Record<string, string>) => {
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), content);
  }
};

const record = (answers: ProjectRecord['answers']): ProjectRecord => ({
  cli: '5.0.0',
  starter: { name: 's', version: '2.0.0', source: starterDir },
  packageManager: 'pnpm',
  answers,
});

beforeEach(async () => {
  starterDir = await mkdtemp(path.join(tmpdir(), 'nm-starter-'));
  projectDir = await mkdtemp(path.join(tmpdir(), 'nm-project-'));
  await write(starterDir, starterFiles);
  checkout = {
    dir: starterDir,
    source: { kind: 'local', location: starterDir },
    manifest: await loadStarterManifest(starterDir),
    files: await listFiles(starterDir),
    dispose: async () => undefined,
  };
});

afterEach(async () => {
  await rm(starterDir, { recursive: true, force: true });
  await rm(projectDir, { recursive: true, force: true });
});

describe('featureFootprint', () => {
  it('lists the files, packages, overlays, and anchored lines a feature owns', async () => {
    const ws = await featureFootprint(checkout, 'ws');
    expect(ws.files).toEqual(['src/lib/ws/client.test.ts', 'src/lib/ws/client.ts']);
    expect(ws.packages).toEqual(['socket.io-client']);
    expect(ws.snippets).toEqual([
      {
        file: 'src/store/rootReducer.ts',
        lines: ["import { wsSlice } from './ws';", '  wsSlice,'],
      },
    ]);
    const zustand = await featureFootprint(checkout, 'zustand');
    expect(zustand.overlayFiles).toEqual(['src/store/index.ts']);
  });
});

describe('checkProject', () => {
  it('reports missing files, packages, and scripts only for features that are on', async () => {
    await write(projectDir, {
      'package.json': JSON.stringify({ scripts: {}, dependencies: {}, devDependencies: {} }),
    });
    const results = await checkProject(
      projectDir,
      record({ state: 'redux', ws: false, tests: true }),
      checkout,
    );
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.ws.on).toBe(false);
    expect(byId.redux.drift).toEqual([
      { kind: 'missingFile', file: 'src/store/index.test.ts' },
      { kind: 'missingFile', file: 'src/store/index.ts' },
      { kind: 'missingFile', file: 'src/store/rootReducer.ts' },
      { kind: 'missingPackage', name: 'redux', dev: false },
    ]);
    // The WebSocket test file belongs to the (off) ws feature, so only the store test is expected.
    expect(byId.tests.drift).toEqual([
      { kind: 'missingFile', file: 'src/store/index.test.ts' },
      { kind: 'missingPackage', name: 'vitest', dev: true },
      { kind: 'missingScript', name: 'test' },
    ]);
  });
});

describe('planReconfigure + applyReconfigure', () => {
  it('turns a feature on: copies its files, adds packages, and lists anchored lines as manual steps', async () => {
    await write(projectDir, {
      'package.json': JSON.stringify({
        scripts: {},
        dependencies: { redux: '^5' },
        devDependencies: {},
      }),
      'src/store/index.ts': 'redux store',
    });
    const before = record({ state: 'redux', ws: false, tests: false });
    const plan = await planReconfigure(projectDir, before, checkout, {
      state: 'redux',
      ws: true,
      tests: false,
    });
    expect(plan.turningOn.map((f) => f.id)).toEqual(['ws']);
    expect(plan.copy).toEqual(['src/lib/ws/client.ts']); // no tests in this project
    expect(plan.addPackages).toEqual({ 'socket.io-client': '^4' });
    expect(plan.manual).toEqual([
      {
        feature: 'ws',
        direction: 'add',
        snippets: [
          {
            file: 'src/store/rootReducer.ts',
            lines: ["import { wsSlice } from './ws';", '  wsSlice,'],
          },
        ],
      },
    ]);

    await applyReconfigure(projectDir, checkout, plan, before);
    expect(await readFile(path.join(projectDir, 'src/lib/ws/client.ts'), 'utf-8')).toBe('ws');
    const pkg = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies).toEqual({ redux: '^5', 'socket.io-client': '^4' });
    const saved = JSON.parse(await readFile(path.join(projectDir, '.next-maker.json'), 'utf-8'));
    expect(saved.answers.ws).toBe(true);
  });

  it('switches state stores: removes redux files and applies the zustand overlay', async () => {
    await write(projectDir, {
      'package.json': JSON.stringify({
        scripts: {},
        dependencies: { redux: '^5' },
        devDependencies: {},
      }),
      'src/store/index.ts': 'redux store',
    });
    const before = record({ state: 'redux', ws: false, tests: false });
    await writeProjectRecord(projectDir, before);
    const plan = await planReconfigure(projectDir, before, checkout, {
      state: 'zustand',
      ws: false,
      tests: false,
    });
    expect(plan.turningOff.map((f) => f.id)).toEqual(['redux']);
    expect(plan.turningOn.map((f) => f.id)).toEqual(['zustand']);
    expect(plan.remove).toEqual(['src/store/index.ts']);
    expect(plan.copy).toEqual(['src/store/index.ts']);
    await applyReconfigure(projectDir, checkout, plan, before);
    expect(await readFile(path.join(projectDir, 'src/store/index.ts'), 'utf-8')).toBe(
      'zustand store',
    );
    const pkg = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies).toEqual({ zustand: '^5' });
  });

  it('turns a feature off: removes files, packages, and unwraps its JSX', async () => {
    await write(projectDir, {
      'package.json': JSON.stringify({
        scripts: {},
        dependencies: { 'socket.io-client': '^4' },
        devDependencies: {},
      }),
      'src/lib/ws/client.ts': 'ws',
      'src/providers/StoreProvider.tsx': starterFiles['src/providers/StoreProvider.tsx'],
    });
    const before = record({ state: 'redux', ws: true, tests: false });
    const plan = await planReconfigure(projectDir, before, checkout, {
      state: 'redux',
      ws: false,
      tests: false,
    });
    expect(plan.remove).toEqual(['src/lib/ws/client.ts']);
    expect(plan.manual[0]).toMatchObject({ feature: 'ws', direction: 'delete' });
    await applyReconfigure(projectDir, checkout, plan, before);
    expect(await readFile(path.join(projectDir, 'src/providers/StoreProvider.tsx'), 'utf-8')).toBe(
      ['export const P = () => (', '  <x />', ');'].join('\n'),
    );
  });
});
