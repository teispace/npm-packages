import path from 'node:path';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { fileExists, readFile, writeFile } from '../../../core/files';
import type { FeatureFinding } from '../../../manifests/types';
import { hasMissingInjection } from '../repair-kit';
import { injectSecurityHeaders } from './headers';

/**
 * Repair security-headers drift.
 *
 * The whole footprint is one block in next.config.ts, so the repair is a
 * single re-injection. `injectSecurityHeaders` is already idempotent and
 * never overwrites a user-defined `headers:` key.
 */
export const repairSecurityHeaders = async (
  projectPath: string,
  drift: FeatureFinding[],
): Promise<void> => {
  if (!hasMissingInjection(drift, PROJECT_PATHS.NEXT_CONFIG)) return;

  const spinner = startSpinner('Repairing security headers...');
  try {
    const target = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
    if (!fileExists(target)) {
      // Nothing to repair into — leave it drifted rather than fabricating a
      // next.config.ts we'd have to guess the shape of.
      spinner.fail(`${PROJECT_PATHS.NEXT_CONFIG} not found — cannot restore security headers.`);
      return;
    }

    const before = await readFile(target);
    const after = injectSecurityHeaders(before);
    if (after !== before) await writeFile(target, after);

    spinner.succeed(pc.green('Security headers restored.'));
  } catch (error) {
    spinner.fail('Failed to repair security headers.');
    throw error;
  }
};
