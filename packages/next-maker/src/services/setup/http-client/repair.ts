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
import { checkIsAlreadySetup } from './checks';
import {
  installBundleSentinelMount,
  rewriteSentinelImports,
  rewriteServerEntryImports,
} from './injectors';

/**
 * Repair HTTP-client drift.
 *
 * `setupHttpClient` can't be reused here: it opens an interactive prompt as
 * soon as a client exists ("Fetch is already setup — add / replace /
 * remove?"), which is not a repair and can't run unattended.
 *
 * The client directories themselves are never re-copied — which variant is
 * active is the user's choice, and losing one of them takes the feature back
 * to "not installed" as far as `detect()` is concerned. What this restores
 * is the shared plumbing every variant needs: `shared/`, `server.ts`, the
 * bundle sentinel, `api-url.ts`, and the sentinel mount in the layout.
 */
export const repairHttpClient = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  const spinner = startSpinner('Repairing HTTP Client...');
  const tempDir = path.join(projectPath, '.next-maker-temp-http-repair');

  try {
    const { status } = await checkIsAlreadySetup(projectPath);
    const clients: ('fetch' | 'axios')[] =
      status === 'both' ? ['fetch', 'axios'] : status === 'none' ? [] : [status];

    const dirTargets = [PROJECT_PATHS.HTTP_SHARED, PROJECT_PATHS.HTTP_BUNDLE_SENTINEL_DIR].filter(
      (rel) => isFileMissing(drift, rel) && !fileExists(path.join(projectPath, rel)),
    );
    const fileTargets = [PROJECT_PATHS.HTTP_SERVER_FILE, PROJECT_PATHS.API_URL_FILE].filter(
      (rel) => isFileMissing(drift, rel) && !fileExists(path.join(projectPath, rel)),
    );

    const restored: string[] = [];
    if (dirTargets.length > 0 || fileTargets.length > 0) {
      spinner.text = 'Fetching assets from starter repo...';
      await withStarterAssets(tempDir, async (temp) => {
        for (const rel of dirTargets) {
          await fs.cp(path.join(temp, rel), path.join(projectPath, rel), {
            recursive: true,
            force: true,
          });
          restored.push(rel);
        }
        for (const rel of fileTargets) {
          await copyFile(path.join(temp, rel), path.join(projectPath, rel));
          restored.push(rel);
        }
      });

      // The template ships the sentinel and the server entry importing BOTH
      // variants; align them with what this project actually has, or the
      // typecheck fails on a missing module.
      if (clients.length > 0) {
        await rewriteSentinelImports(projectPath, clients);
        await rewriteServerEntryImports(projectPath, clients);
      }
    }

    if (hasMissingInjection(drift)) {
      spinner.text = 'Re-mounting the bundle sentinel...';
      // Resolves the active layout itself ([locale] when i18n is installed,
      // root layout otherwise) and is a no-op when already mounted.
      await installBundleSentinelMount(projectPath);
      restored.push('<HttpClientBundleSentinel /> mount');
    }

    // The manifest declares no packages (axios is conditional), but keep the
    // generic path so a future footprint change repairs for free.
    const installed = await repairPackages(projectPath, drift);

    const done = [
      restored.length > 0 ? `restored ${restored.join(', ')}` : null,
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0 ? `HTTP Client repaired (${done.join('; ')}).` : 'HTTP Client repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair HTTP Client.');
    throw error;
  }
};
