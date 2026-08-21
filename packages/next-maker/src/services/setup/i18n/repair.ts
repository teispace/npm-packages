import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { copyFile, fileExists } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import {
  hasMissingInjection,
  isFileMissing,
  repairPackages,
  withStarterAssets,
} from '../repair-kit';
import {
  updateConfigIndex,
  updateNextConfig,
  updateRootProvider,
  updateTypesIndex,
} from './injectors';

const ROOT_PROVIDER = 'src/providers/RootProvider.tsx';

/**
 * Repair i18n drift.
 *
 * Restores the plumbing — `src/i18n/`, `src/proxy.ts`, the next.config
 * plugin wrap, the `<NextIntlClientProvider>` wrap and `next-intl` itself.
 *
 * `src/app/[locale]/` is deliberately NOT recreated. Producing it means
 * running `migrateToLocaleStructure`, which MOVES the app router's pages;
 * doing that unattended to a project that already lost the segment could
 * relocate user code with no way back. A missing `[locale]` directory stays
 * reported as drift, and doctor prints it as still-drifted rather than
 * claiming a fix.
 */
export const repairI18n = async (projectPath: string, drift: FeatureFinding[]): Promise<void> => {
  const spinner = startSpinner('Repairing Internationalization...');
  const tempDir = path.join(projectPath, '.next-maker-temp-i18n-repair');

  try {
    const i18nDir = path.join(projectPath, PROJECT_PATHS.I18N_DIR);
    const proxyPath = path.join(projectPath, PROJECT_PATHS.PROXY);

    const needsI18nDir = isFileMissing(drift, PROJECT_PATHS.I18N_DIR) && !fileExists(i18nDir);
    const needsProxy = isFileMissing(drift, PROJECT_PATHS.PROXY) && !fileExists(proxyPath);

    const restored: string[] = [];
    if (needsI18nDir || needsProxy) {
      spinner.text = 'Fetching assets from starter repo...';
      await withStarterAssets(tempDir, async (temp) => {
        if (needsI18nDir) {
          await fs.cp(path.join(temp, PROJECT_PATHS.I18N_DIR), i18nDir, { recursive: true });
          restored.push(PROJECT_PATHS.I18N_DIR);
        }
        if (needsProxy) {
          await copyFile(path.join(temp, PROJECT_PATHS.PROXY), proxyPath);
          restored.push(PROJECT_PATHS.PROXY);
        }
      });
    }

    if (hasMissingInjection(drift, PROJECT_PATHS.NEXT_CONFIG)) {
      spinner.text = 'Restoring the next-intl plugin wrap...';
      await updateNextConfig(projectPath);
      restored.push('createNextIntlPlugin wrap');
    }

    if (hasMissingInjection(drift, ROOT_PROVIDER)) {
      spinner.text = 'Restoring <NextIntlClientProvider>...';
      await updateRootProvider(projectPath);
      restored.push('<NextIntlClientProvider> wrap');
    }

    // Barrel exports are idempotent appends and cheap to re-assert; they
    // are what the restored files above are reached through.
    if (restored.length > 0) {
      await updateTypesIndex(projectPath);
      await updateConfigIndex(projectPath);
    }

    spinner.text = 'Restoring dependencies...';
    const installed = await repairPackages(projectPath, drift);

    const skippedLocale = isFileMissing(drift, PROJECT_PATHS.LOCALE_DIR);
    const done = [
      restored.length > 0 ? `restored ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0
          ? `Internationalization repaired (${done.join('; ')}).`
          : 'Internationalization repaired.',
      ),
    );

    if (skippedLocale) {
      console.log(
        pc.yellow(
          `  ⚠️  ${PROJECT_PATHS.LOCALE_DIR} is missing. Recreating it means moving your app-router pages, so it is left for you: run \`next-maker setup --i18n\` on a clean tree, or move your pages under ${PROJECT_PATHS.LOCALE_DIR}/ by hand.`,
        ),
      );
    }
  } catch (error) {
    spinner.fail('Failed to repair Internationalization.');
    throw error;
  }
};
