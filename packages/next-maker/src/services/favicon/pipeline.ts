import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { detectPwa } from './detect';
import { encodeIco, flatColor, renderPng } from './encoders';
import {
  buildBootstrapManifest,
  buildIconEntries,
  renderManifestSnippet,
  writeJsonManifest,
} from './manifest';
import type { FaviconOptions, FaviconRunResult, FaviconWriteResult } from './types';
import { validateSource } from './validate';

const fileExists = async (p: string): Promise<boolean> => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

interface WriteJob {
  outPath: string;
  bytes: Buffer;
}

const writeAll = async (
  jobs: WriteJob[],
  force: boolean,
  dryRun: boolean,
): Promise<FaviconWriteResult[]> => {
  const results: FaviconWriteResult[] = [];
  for (const job of jobs) {
    const exists = await fileExists(job.outPath);
    if (exists && !force) {
      results.push({ path: job.outPath, bytes: job.bytes.length, skipped: true });
      continue;
    }
    if (!dryRun) {
      await mkdir(path.dirname(job.outPath), { recursive: true });
      await writeFile(job.outPath, job.bytes);
    }
    results.push({ path: job.outPath, bytes: job.bytes.length });
  }
  return results;
};

export const runFavicon = async (
  projectPath: string,
  options: FaviconOptions,
): Promise<FaviconRunResult> => {
  const source = await validateSource(options.source);
  const ogSource = options.ogSource ? await validateSource(options.ogSource) : source;

  const jobs: WriteJob[] = [];

  // 1. favicon.ico — always, multi-size, square
  const icoFrames: Buffer[] = [];
  for (const size of options.icoSizes) {
    icoFrames.push(
      await renderPng({
        source: source.absolutePath,
        size,
        shape: 'square',
        radiusPercent: options.radius,
        bg: options.bg,
        paddingPercent: options.padding,
        fit: options.fit,
        quality: options.quality,
        forceSquare: true,
      }),
    );
  }
  const icoBuffer = await encodeIco(icoFrames);
  jobs.push({ outPath: path.join(options.outDir, 'favicon.ico'), bytes: icoBuffer });

  // 2. icon.png (512×512)
  if (options.emitIcon) {
    const buf = await renderPng({
      source: source.absolutePath,
      size: 512,
      shape: options.shape,
      radiusPercent: options.radius,
      bg: options.bg,
      paddingPercent: options.padding,
      fit: options.fit,
      quality: options.quality,
    });
    jobs.push({ outPath: path.join(options.outDir, 'icon.png'), bytes: buf });
  }

  // 3. apple-icon.png (180×180, opaque bg per Apple guidelines)
  if (options.emitApple) {
    const appleBg = options.bg === 'transparent' ? '#ffffff' : options.bg;
    const buf = await renderPng({
      source: source.absolutePath,
      size: 180,
      shape: options.shape,
      radiusPercent: options.radius,
      bg: appleBg,
      paddingPercent: options.padding,
      fit: options.fit,
      quality: options.quality,
    });
    jobs.push({ outPath: path.join(options.outDir, 'apple-icon.png'), bytes: buf });
  }

  // 4. opengraph-image.png (1200×630, contained on bg)
  if (options.emitOg) {
    const buf = await renderOgImage(ogSource.absolutePath, options, false);
    jobs.push({ outPath: path.join(options.outDir, 'opengraph-image.png'), bytes: buf });
  }

  // 5. twitter-image.png (1200×630)
  if (options.emitTwitter) {
    const buf = await renderOgImage(ogSource.absolutePath, options, true);
    jobs.push({ outPath: path.join(options.outDir, 'twitter-image.png'), bytes: buf });
  }

  // 6. PWA icons + manifest
  let pwaSnippet: string | undefined;
  if (options.pwa || options.pwaInit) {
    const pwa = await detectPwa(projectPath);
    if (options.pwa && !pwa.isPwa) {
      throw new Error(
        'No PWA setup detected. Use --pwa-init to bootstrap a manifest, or set up next-pwa/serwist first.',
      );
    }

    const publicDir = path.join(projectPath, 'public');
    const sizes = [192, 512];
    const iconJobs: { src: string; size: number }[] = [];
    for (const size of sizes) {
      const buf = await renderPng({
        source: source.absolutePath,
        size,
        shape: options.shape,
        radiusPercent: options.radius,
        bg: options.bg,
        paddingPercent: options.padding,
        fit: options.fit,
        quality: options.quality,
      });
      const fileName = `icon-${size}.png`;
      jobs.push({ outPath: path.join(publicDir, fileName), bytes: buf });
      iconJobs.push({ src: `/${fileName}`, size });
    }

    const icons = buildIconEntries(iconJobs);
    if (pwa.publicManifestPath) {
      if (!options.dryRun) await writeJsonManifest(pwa.publicManifestPath, icons);
    } else if (pwa.appManifestPath) {
      pwaSnippet = renderManifestSnippet(icons);
    } else if (options.pwaInit) {
      const bootstrapPath = path.join(publicDir, 'manifest.webmanifest');
      const content = buildBootstrapManifest(path.basename(projectPath) || 'App', '#000000', icons);
      jobs.push({ outPath: bootstrapPath, bytes: Buffer.from(content, 'utf-8') });
    }
  }

  const outputs = await writeAll(jobs, options.force, options.dryRun);
  return { outputs, pwaSnippet };
};

const renderOgImage = async (
  source: string,
  options: FaviconOptions,
  isTwitter: boolean,
): Promise<Buffer> => {
  const targetWidth = 1200;
  const targetHeight = isTwitter ? 600 : 630;
  const innerSize = Math.round(
    Math.min(targetWidth, targetHeight) * (1 - (options.padding * 2) / 100),
  );

  const inner = await renderPng({
    source,
    size: innerSize,
    shape: options.shape,
    radiusPercent: options.radius,
    bg: 'transparent',
    paddingPercent: 0,
    fit: options.fit,
    quality: options.quality,
  });

  const bgColor = options.bg === 'transparent' ? '#ffffff' : options.bg;
  const background = await flatColor(bgColor);
  const offsetLeft = Math.round((targetWidth - innerSize) / 2);
  const offsetTop = Math.round((targetHeight - innerSize) / 2);

  return sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background,
    },
  })
    .composite([{ input: inner, left: offsetLeft, top: offsetTop }])
    .png()
    .toBuffer();
};
