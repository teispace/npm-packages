import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { log, logError, spinner } from '../config';
import { promptForSliceDetails } from '../prompts/slice.prompt';
import { detectProjectSetup, directoryExists } from '../detection';
import { executePipeline, createSlicePipelineSteps } from '../pipelines';

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

        if (options.persist && options.noPersist === true) {
          logError('Cannot use --persist and --no-persist together');
          process.exit(1);
        }

        log(pc.cyan('\n🔧 Slice Generator\n'));

        // Detect and validate Redux
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        if (!detection.hasRedux) {
          spinner.fail('Redux is not setup in this project');
          logError('Please install @reduxjs/toolkit and react-redux first');
          log(pc.dim('\nRun: npm install @reduxjs/toolkit react-redux\n'));
          process.exit(1);
        }

        log(pc.dim(`  Redux: ✓\n`));

        // Prompt and resolve paths
        const sliceOptions = await promptForSliceDetails(
          name,
          options.persist,
          options.noPersist === true ? false : undefined,
        );

        const { basePath, slicePath } = resolveSlicePaths(
          projectPath,
          sliceOptions.sliceName,
          options.path,
        );

        const featureStorePath = path.join(projectPath, basePath);
        if (!existsSync(featureStorePath)) {
          await mkdir(featureStorePath, { recursive: true });
        }

        const exists = await directoryExists(projectPath, sliceOptions.sliceName, basePath);
        if (exists) {
          logError(`Slice '${sliceOptions.sliceName}' already exists at ${basePath}!`);
          process.exit(1);
        }

        // Execute generation pipeline
        await executePipeline(createSlicePipelineSteps(), {
          projectPath,
          spinner,
          sliceName: sliceOptions.sliceName,
          basePath,
          slicePath,
          persistSlice: sliceOptions.persistSlice,
        });

        printSliceSuccess(sliceOptions, basePath);
      } catch (error) {
        spinner.fail('Slice generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};

const resolveSlicePaths = (
  projectPath: string,
  sliceName: string,
  customPath?: string,
): { basePath: string; slicePath: string } => {
  let basePath: string;

  if (customPath) {
    const cleanPath = customPath.replace(/^src\//, '');
    if (cleanPath.startsWith('features/')) {
      const featureName = cleanPath.split('/')[1];
      basePath = path.join('src', 'features', featureName, 'store');
    } else {
      basePath = path.join('src', cleanPath);
    }
  } else {
    basePath = path.join('src', 'features', sliceName, 'store');
  }

  return {
    basePath,
    slicePath: path.join(projectPath, basePath, sliceName),
  };
};

const printSliceSuccess = (
  sliceOptions: { sliceName: string; persistSlice: boolean },
  basePath: string,
) => {
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
};
