import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, writeFile } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import { hasMissingInjection, repairPackages, repairScripts } from '../repair-kit';
import { injectBundleAnalyzer } from './transform';

/**
 * Repair @next/bundle-analyzer drift on an already-installed project.
 *
 * Three independent pieces can rot: the next.config.ts wrapping, the
 * `analyze` script, and the devDependency. Each is restored only when the
 * drift actually reported it.
 */
export const repairBundleAnalyzer = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  const spinner = startSpinner('Repairing Bundle Analyzer...');
  try {
    if (hasMissingInjection(drift, PROJECT_PATHS.NEXT_CONFIG)) {
      const target = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
      if (fileExists(target)) {
        const before = await readFile(target);
        const after = injectBundleAnalyzer(before);
        if (after !== before) await writeFile(target, after);
      }
    }

    const installed = await repairPackages(projectPath, drift);
    const scripts = await repairScripts(projectPath, drift);

    const done = [
      installed.length > 0 ? `reinstalled ${installed.join(', ')}` : null,
      scripts.length > 0 ? `restored ${scripts.join(', ')}` : null,
    ].filter(Boolean);

    spinner.succeed(
      pc.green(
        done.length > 0
          ? `Bundle Analyzer repaired (${done.join('; ')}).`
          : 'Bundle Analyzer repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair Bundle Analyzer.');
    throw error;
  }
};
