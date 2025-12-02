import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { log, logError, spinner } from '../config';
import { promptForSliceDetails } from '../prompts/slice.prompt';
import { detectProjectSetup } from '../services/feature/detection.service';
import { generateSliceFiles } from '../services/slice/slice.service';
import { registerSliceInRootReducer } from '../services/feature/registration.service';
import { sliceExists } from '../services/slice/detection.service';

interface SliceCommandOptions {
  path?: string;
  persist?: boolean;
  noPersist?: boolean;
}

export const registerSliceCommand = (program: Command) => {
  program
    .command('slice [name]')
    .description('Generate a Redux slice')
    .option('--path <path>', 'Custom path for slice generation (default: create new feature)')
    .option('--persist', 'Enable persistence for this slice')
    .option('--no-persist', 'Disable persistence for this slice')
    .action(async (name: string | undefined, options: SliceCommandOptions) => {
      try {
        const projectPath = process.cwd();

        // Validate conflicting options
        if (options.persist && options.noPersist === true) {
          logError('Cannot use --persist and --no-persist together');
          process.exit(1);
        }

        log(pc.cyan('\n🔧 Slice Generator\n'));

        // Step 1: Detect project setup
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        // Step 2: Check if Redux is setup
        if (!detection.hasRedux) {
          spinner.fail('Redux is not setup in this project');
          logError('Please install @reduxjs/toolkit and react-redux first');
          log(pc.dim('\nRun: npm install @reduxjs/toolkit react-redux\n'));
          process.exit(1);
        }

        log(pc.dim(`  Redux: ✓\n`));

        // Step 3: Prompt for slice details
        const sliceOptions = await promptForSliceDetails(
          name,
          options.persist,
          options.noPersist === true ? false : undefined,
        );

        // Step 4: Determine slice path (feature-first approach)
        let basePath: string;
        let featureName: string;
        let slicePath: string;

        if (options.path) {
          // Custom path provided
          const customPath = options.path.replace(/^src\//, '');

          // Check if custom path is a feature
          if (customPath.startsWith('features/')) {
            // Extract feature name and ensure store subdirectory
            const parts = customPath.split('/');
            featureName = parts[1]; // features/featureName/...
            basePath = path.join('src', 'features', featureName, 'store');
            slicePath = path.join(projectPath, basePath, sliceOptions.sliceName);
          } else {
            // Non-feature custom path - use as-is but treat as feature store
            basePath = path.join('src', customPath);
            featureName = customPath.split('/')[0]; // First directory as feature name
            slicePath = path.join(projectPath, basePath, sliceOptions.sliceName);
          }
        } else {
          // Default: Create new feature with store
          featureName = sliceOptions.sliceName;
          basePath = path.join('src', 'features', featureName, 'store');
          slicePath = path.join(projectPath, basePath, sliceOptions.sliceName);
        }

        // Step 5: Ensure feature and store directories exist
        const featureStorePath = path.join(projectPath, basePath);
        if (!existsSync(featureStorePath)) {
          await mkdir(featureStorePath, { recursive: true });
        }

        // Check if slice already exists
        const exists = await sliceExists(projectPath, sliceOptions.sliceName, basePath);
        if (exists) {
          logError(`Slice '${sliceOptions.sliceName}' already exists at ${basePath}!`);
          process.exit(1);
        }

        // Step 6: Generate slice files
        spinner.start('Generating slice files...');
        await generateSliceFiles({
          sliceName: sliceOptions.sliceName,
          slicePath,
          persistSlice: sliceOptions.persistSlice,
        });
        spinner.succeed('Slice files generated');

        // Step 7: Register in rootReducer
        spinner.start('Registering slice in rootReducer...');
        // For features: basePath includes store (e.g., src/features/auth/store)
        // We need to register the slice at basePath/sliceName
        await registerSliceInRootReducer(
          projectPath,
          sliceOptions.sliceName,
          sliceOptions.persistSlice,
          basePath,
        );
        spinner.succeed('Slice registered in rootReducer');

        // Success message
        const displayPath = path.join(basePath, sliceOptions.sliceName);
        log(pc.green(`\n✨ Slice '${sliceOptions.sliceName}' created successfully!\n`));
        log(pc.dim('Generated files:'));
        log(pc.dim(`  📂 ${displayPath}/`));
        log(pc.dim(`     ├── ${sliceOptions.sliceName}.slice.ts`));
        log(pc.dim(`     ├── ${sliceOptions.sliceName}.selectors.ts`));
        if (sliceOptions.persistSlice) log(pc.dim(`     ├── persist.ts`));
        log(pc.dim(`     ├── ${sliceOptions.sliceName}.types.ts`));
        log(pc.dim(`     └── index.ts\n`));

        log(pc.cyan('Next steps:'));
        const importPath = basePath.replace(/^src\//, '@/');
        log(
          pc.dim(
            `  1. Import actions: import { setLoading, setError } from '${importPath}/${sliceOptions.sliceName}'`,
          ),
        );
        log(pc.dim(`  2. Use in component: dispatch(setLoading(true))`));
        log('');
      } catch (error) {
        spinner.fail('Slice generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
