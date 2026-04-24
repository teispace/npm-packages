import fs from 'node:fs/promises';
import path from 'node:path';
import degit from 'degit';
import pc from 'picocolors';
import { PROJECT_PATHS } from '../../../config/paths';
import { startSpinner } from '../../../config/spinner';
import { copyFile, deleteDirectory, fileExists, readFile, updateJson } from '../../../core/files';
import { detectPackageManager, installDevPackages, runScript } from '../../../core/package-manager';
import { writeTestUtils } from '../../common/test-utils';

const TEST_DEVDEPS = [
  'vitest',
  'jsdom',
  '@vitejs/plugin-react',
  '@testing-library/dom',
  '@testing-library/jest-dom',
  '@testing-library/react',
  '@testing-library/user-event',
];

export const setupTests = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Setting up testing (Vitest + RTL)...');
  const tempDir = path.join(projectPath, '.next-maker-temp-tests');

  try {
    const vitestConfigPath = path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG);
    if (fileExists(vitestConfigPath)) {
      spinner.fail('Testing is already set up (vitest.config.ts exists).');
      return;
    }

    // 1. Fetch the starter to copy vitest.config.ts + test/setup.ts.
    spinner.text = 'Fetching assets from starter repo...';
    const emitter = degit('teispace/nextjs-starter', { cache: false, force: true, verbose: false });
    await emitter.clone(tempDir);

    await copyFile(
      path.join(tempDir, PROJECT_PATHS.VITEST_CONFIG),
      path.join(projectPath, PROJECT_PATHS.VITEST_CONFIG),
    );

    const testDir = path.join(projectPath, PROJECT_PATHS.TEST_DIR);
    await fs.mkdir(testDir, { recursive: true });
    await copyFile(
      path.join(tempDir, PROJECT_PATHS.TEST_DIR, 'setup.ts'),
      path.join(testDir, 'setup.ts'),
    );

    // 2. Generate test-utils matching existing features.
    const packageJsonPath = path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON);
    const pkg = JSON.parse(await readFile(packageJsonPath));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const hasRedux = !!(deps['@reduxjs/toolkit'] && deps['react-redux']);
    const hasI18n = !!deps['next-intl'];
    await writeTestUtils(projectPath, { redux: hasRedux, i18n: hasI18n });

    // 3. Update package.json: scripts + reinstate `yarn test` in validate.
    await updateJson(packageJsonPath, (p) => {
      p.scripts = p.scripts ?? {};
      p.scripts.test = p.scripts.test ?? 'vitest run';
      p.scripts['test:watch'] = p.scripts['test:watch'] ?? 'vitest';
      p.scripts['test:coverage'] = p.scripts['test:coverage'] ?? 'vitest run --coverage';
      if (
        typeof p.scripts.validate === 'string' &&
        !/\byarn\s+test(?![:\w])/.test(p.scripts.validate)
      ) {
        p.scripts.validate = p.scripts.validate.replace(
          /(\byarn\s+check:deprecated\s*)(&&)/,
          '$1&& yarn test $2',
        );
      }
      return p;
    });

    // 4. Install dev deps.
    spinner.text = 'Installing testing devDependencies...';
    const manager = await detectPackageManager(projectPath);
    await installDevPackages(projectPath, manager, TEST_DEVDEPS);

    // 5. Format.
    spinner.text = 'Formatting code...';
    await runScript(projectPath, manager, 'lint:fix');

    spinner.succeed(pc.green('Testing setup complete.'));
  } catch (error) {
    spinner.fail('Failed to set up testing.');
    throw error;
  } finally {
    await deleteDirectory(tempDir);
  }
};
