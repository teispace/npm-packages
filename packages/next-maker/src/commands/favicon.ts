import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner, warning } from '../config';
import { promptForFaviconSource } from '../prompts/favicon.prompt';
import { detectAppDir, runFavicon } from '../services/favicon';
import type { FaviconFit, FaviconOptions, FaviconShape } from '../services/favicon/types';
import { parseSizes } from '../services/favicon/validate';

interface RawFaviconCliOptions {
  path?: string;
  out?: string;
  force?: boolean;
  dryRun?: boolean;

  icon?: boolean;
  apple?: boolean;
  og?: boolean;
  ogSource?: string;
  twitter?: boolean;
  all?: boolean;

  pwa?: boolean;
  pwaInit?: boolean;

  shape?: string;
  radius?: string;
  bg?: string;
  padding?: string;
  fit?: string;
  sizes?: string;
  quality?: string;
}

const SHAPES: FaviconShape[] = ['square', 'rounded', 'circle', 'squircle'];
const FITS: FaviconFit[] = ['contain', 'cover', 'clip'];

const parseEnumOption = <T extends string>(
  raw: string | undefined,
  allowed: T[],
  fallback: T,
  flag: string,
): T => {
  if (!raw) return fallback;
  if (!allowed.includes(raw as T)) {
    throw new Error(`Invalid value for --${flag}: '${raw}'. Allowed: ${allowed.join(', ')}`);
  }
  return raw as T;
};

const parseNumberOption = (
  raw: string | undefined,
  fallback: number,
  flag: string,
  min: number,
  max: number,
): number => {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(
      `Invalid value for --${flag}: '${raw}'. Must be a number between ${min}–${max}.`,
    );
  }
  return n;
};

export const registerFaviconCommand = (program: Command) => {
  program
    .command('favicon')
    .description('Generate favicon.ico (and optionally icons, OG image, PWA manifest icons)')
    .option('--path <file>', 'Path to source image (PNG, JPG, WebP, SVG, AVIF)')
    .option('--out <dir>', 'Output dir (default: src/app or app)')
    .option('--force', 'Overwrite existing files without prompt', false)
    .option('--dry-run', 'Show what would be written without writing', false)
    .option('--icon', 'Also emit icon.png (512×512)', false)
    .option('--apple', 'Also emit apple-icon.png (180×180)', false)
    .option('--og', 'Also emit opengraph-image.png (1200×630)', false)
    .option('--og-source <file>', 'Use a separate image for the OG/Twitter card')
    .option('--twitter', 'Also emit twitter-image.png (1200×600)', false)
    .option('--all', 'Shorthand for --icon --apple --og', false)
    .option(
      '--pwa',
      'Detect PWA setup and emit manifest icons (192/512); errors if not detected',
      false,
    )
    .option('--pwa-init', 'Bootstrap public/manifest.webmanifest with icons', false)
    .option('--shape <shape>', 'square | rounded | circle | squircle', 'square')
    .option('--radius <percent>', 'Corner radius % when shape=rounded (0-50)', '20')
    .option('--bg <color>', 'Background color (hex, css name, or "transparent")', 'transparent')
    .option('--padding <percent>', 'Padding around source content (0-30)', '0')
    .option('--fit <fit>', 'How source fits target: contain | cover | clip', 'contain')
    .option('--sizes <list>', 'Comma-separated ICO sizes (default: 16,32,48)')
    .option('--quality <n>', 'PNG quality 1-100 (default: 90)', '90')
    .action(async (raw: RawFaviconCliOptions) => {
      try {
        const projectPath = process.cwd();

        log(pc.cyan('\n🎨 Favicon Generator\n'));

        const promptResult = await promptForFaviconSource({ source: raw.path });

        const outDir = await resolveOutDir(projectPath, raw.out);
        const shape = parseEnumOption(raw.shape, SHAPES, 'square', 'shape');
        const fit = parseEnumOption(raw.fit, FITS, 'contain', 'fit');
        const radius = parseNumberOption(raw.radius, 20, 'radius', 0, 50);
        const padding = parseNumberOption(raw.padding, 0, 'padding', 0, 30);
        const quality = parseNumberOption(raw.quality, 90, 'quality', 1, 100);
        const icoSizes = parseSizes(raw.sizes, [16, 32, 48]);

        const all = raw.all === true;
        const options: FaviconOptions = {
          source: promptResult.source,
          outDir,
          force: !!raw.force,
          dryRun: !!raw.dryRun,
          emitIcon: !!raw.icon || all,
          emitApple: !!raw.apple || all,
          emitOg: !!raw.og || all,
          emitTwitter: !!raw.twitter,
          ogSource: raw.ogSource,
          pwa: !!raw.pwa,
          pwaInit: !!raw.pwaInit,
          shape,
          radius,
          bg: raw.bg ?? 'transparent',
          padding,
          fit,
          icoSizes,
          quality,
        };

        spinner.start('Generating favicon assets...');
        const result = await runFavicon(projectPath, options);
        spinner.succeed(options.dryRun ? 'Favicon plan ready' : 'Favicon assets generated');

        log('');
        for (const out of result.outputs) {
          const rel = path.relative(projectPath, out.path);
          if (out.skipped) {
            log(pc.yellow(`  ↷ skipped ${rel} (exists; use --force to overwrite)`));
          } else if (options.dryRun) {
            log(pc.dim(`  📄 would write ${rel} (${formatBytes(out.bytes)})`));
          } else {
            log(pc.green(`  ✓ ${rel} `) + pc.dim(`(${formatBytes(out.bytes)})`));
          }
        }

        if (result.pwaSnippet) {
          log('');
          log(pc.cyan('Add this to your typed manifest (src/app/manifest.ts):'));
          log(pc.dim(result.pwaSnippet));
        }

        log('');
      } catch (err) {
        spinner.fail('Favicon generation failed');
        const message = err instanceof Error ? err.message : String(err);
        logError(message);
        process.exit(1);
      }
    });
};

const resolveOutDir = async (projectPath: string, override?: string): Promise<string> => {
  if (override) return path.isAbsolute(override) ? override : path.resolve(projectPath, override);
  const detected = await detectAppDir(projectPath);
  if (detected) return detected;
  warning('Could not detect app/ or src/app/ — falling back to src/app');
  return path.join(projectPath, 'src', 'app');
};

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};
