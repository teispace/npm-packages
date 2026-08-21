import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, writeFile } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import { hasMissingInjection, repairPackages } from '../repair-kit';
import { injectReactCompilerFlag } from './transform';

/**
 * Repair React Compiler drift on an already-installed project.
 *
 * Footprint is tiny: the `reactCompiler: true` flag in next.config.ts plus
 * `babel-plugin-react-compiler` in devDependencies. The installer refuses to
 * run once the flag exists, which is exactly the state doctor reports drift
 * in — so the repair re-derives the work from the findings instead.
 */
export const repairReactCompiler = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  const spinner = startSpinner('Repairing React Compiler...');
  try {
    if (hasMissingInjection(drift, PROJECT_PATHS.NEXT_CONFIG)) {
      const target = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
      // A missing next.config.ts is not something a repair may invent —
      // doctor's post-fix re-check will keep reporting it, truthfully.
      if (fileExists(target)) {
        const before = await readFile(target);
        const after = injectReactCompilerFlag(before);
        if (after !== before) await writeFile(target, after);
      }
    }

    const installed = await repairPackages(projectPath, drift);

    spinner.succeed(
      pc.green(
        installed.length > 0
          ? `React Compiler repaired (reinstalled ${installed.join(', ')}).`
          : 'React Compiler repaired.',
      ),
    );
  } catch (error) {
    spinner.fail('Failed to repair React Compiler.');
    throw error;
  }
};
