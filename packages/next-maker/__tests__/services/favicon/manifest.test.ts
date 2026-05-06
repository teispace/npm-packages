import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildBootstrapManifest,
  buildIconEntries,
  patchJsonManifest,
  renderManifestSnippet,
  writeJsonManifest,
} from '../../../src/services/favicon/manifest';

const sampleEntries = () =>
  buildIconEntries([
    { src: '/icon-192.png', size: 192 },
    { src: '/icon-512.png', size: 512 },
  ]);

const tmpRoots: string[] = [];

const mktmp = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'next-maker-manifest-'));
  tmpRoots.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(tmpRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('buildIconEntries', () => {
  it('builds entries with sizes string and PNG mime', () => {
    const entries = sampleEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable',
    });
  });
});

describe('patchJsonManifest', () => {
  it('merges new icons with existing, dedupes by src', async () => {
    const dir = await mktmp();
    const manifestPath = path.join(dir, 'manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: 'App',
        icons: [
          { src: '/icon-192.png', sizes: 'old', type: 'image/png' },
          { src: '/keep.png', sizes: '64x64', type: 'image/png' },
        ],
      }),
      'utf-8',
    );

    const next = await patchJsonManifest(manifestPath, sampleEntries());
    const parsed = JSON.parse(next);
    expect(parsed.name).toBe('App');
    const sources = parsed.icons.map((i: { src: string }) => i.src);
    expect(sources).toContain('/keep.png');
    expect(sources).toContain('/icon-192.png');
    expect(sources).toContain('/icon-512.png');
    // dedup: /icon-192.png should appear once with the new sizes value.
    const overridden = parsed.icons.find((i: { src: string }) => i.src === '/icon-192.png');
    expect(overridden.sizes).toBe('192x192');
  });

  it('seeds icons array when manifest has none', async () => {
    const dir = await mktmp();
    const manifestPath = path.join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({ name: 'App' }), 'utf-8');
    const next = await patchJsonManifest(manifestPath, sampleEntries());
    const parsed = JSON.parse(next);
    expect(parsed.icons).toHaveLength(2);
  });
});

describe('writeJsonManifest', () => {
  it('writes the patched manifest back to disk', async () => {
    const dir = await mktmp();
    const manifestPath = path.join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({ name: 'App' }), 'utf-8');
    await writeJsonManifest(manifestPath, sampleEntries());
    const written = JSON.parse(await readFile(manifestPath, 'utf-8'));
    expect(written.icons).toHaveLength(2);
  });
});

describe('renderManifestSnippet', () => {
  it('renders a valid icons array fragment', () => {
    const snippet = renderManifestSnippet(sampleEntries());
    expect(snippet).toMatch(/^icons: \[/);
    expect(snippet).toContain("src: '/icon-192.png'");
    expect(snippet).toContain("sizes: '512x512'");
    expect(snippet).toContain("purpose: 'any maskable'");
  });
});

describe('buildBootstrapManifest', () => {
  it('embeds name, theme color, and icons', () => {
    const out = buildBootstrapManifest('My App', '#0f172a', sampleEntries());
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('My App');
    expect(parsed.theme_color).toBe('#0f172a');
    expect(parsed.icons).toHaveLength(2);
    expect(parsed.start_url).toBe('/');
    expect(parsed.display).toBe('standalone');
  });
});
