import { readFile, writeFile } from 'node:fs/promises';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export const buildIconEntries = (publicPaths: { src: string; size: number }[]): ManifestIcon[] =>
  publicPaths.map(({ src, size }) => ({
    src,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose: 'any maskable',
  }));

/**
 * Merge new icons into a JSON manifest, deduping by `src`. Returns the
 * formatted JSON string ready to write back.
 */
export const patchJsonManifest = async (
  manifestPath: string,
  icons: ManifestIcon[],
): Promise<string> => {
  const raw = await readFile(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as { icons?: ManifestIcon[]; [key: string]: unknown };
  const existing = Array.isArray(parsed.icons) ? parsed.icons : [];
  const bySrc = new Map<string, ManifestIcon>();
  for (const icon of [...existing, ...icons]) {
    if (icon && typeof icon.src === 'string') bySrc.set(icon.src, icon);
  }
  parsed.icons = [...bySrc.values()];
  return `${JSON.stringify(parsed, null, 2)}\n`;
};

export const writeJsonManifest = async (
  manifestPath: string,
  icons: ManifestIcon[],
): Promise<void> => {
  const next = await patchJsonManifest(manifestPath, icons);
  await writeFile(manifestPath, next, 'utf-8');
};

/**
 * Render a snippet the user can paste into a typed `manifest.ts`.
 */
export const renderManifestSnippet = (icons: ManifestIcon[]): string => {
  const body = icons
    .map(
      (icon) =>
        `    { src: '${icon.src}', sizes: '${icon.sizes}', type: '${icon.type}'${
          icon.purpose ? `, purpose: '${icon.purpose}'` : ''
        } }`,
    )
    .join(',\n');
  return `icons: [\n${body},\n  ],`;
};

/**
 * Bootstrap a fresh `manifest.webmanifest` for projects without one.
 */
export const buildBootstrapManifest = (
  appName: string,
  themeColor: string,
  icons: ManifestIcon[],
): string => {
  const manifest = {
    name: appName,
    short_name: appName,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    icons,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
};
