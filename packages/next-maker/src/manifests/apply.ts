import type { FeatureFinding } from './types';

/**
 * Build a manifest `apply` that routes to the right code path.
 *
 * `setup` calls `apply(projectPath)` with no drift → first-run installer.
 * `doctor --fix` calls `apply(projectPath, drift)` on an ALREADY-installed
 * feature → repairer, which must fix exactly the reported findings and must
 * not consult the installer's "is this already set up?" guard.
 *
 * Keeping the two behind one entry point (rather than adding a second
 * optional `repair` field) means every caller of `apply` gets the correct
 * behaviour for free, and a manifest can never accidentally ship a repair
 * path that `doctor` doesn't know about.
 */
export const withRepair =
  (
    install: (projectPath: string) => Promise<void>,
    repair: (projectPath: string, drift: FeatureFinding[]) => Promise<void>,
  ) =>
  async (projectPath: string, drift?: FeatureFinding[]): Promise<void> => {
    if (drift && drift.length > 0) {
      await repair(projectPath, drift);
      return;
    }
    await install(projectPath);
  };
