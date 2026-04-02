import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { log, logError, spinner } from '../config';
import { promptForFeatureDetails } from '../prompts/feature.prompt';
import { directoryExists } from '../detection';
import { executePipeline, createFeaturePipelineSteps } from '../pipelines';

interface FeatureCommandOptions {
  skipStore?: boolean;
  store?: 'persist' | 'no-persist';
  skipService?: boolean;
  service?: 'axios' | 'fetch';
  path?: string;
}

export const registerFeatureCommand = (program: Command) => {
  program
    .command('feature [name]')
    .description('Generate a new feature module')
    .option('--skip-store', 'Skip Redux store generation')
    .option('--store <type>', 'Generate Redux store with persistence option (persist|no-persist)')
    .option('--skip-service', 'Skip API service generation')
    .option('--service <client>', 'Generate API service with specific HTTP client (axios|fetch)')
    .option('--path <path>', 'Custom path for feature generation (default: src/features)')
    .action(async (name: string | undefined, options: FeatureCommandOptions) => {
      try {
        const projectPath = process.cwd();

        validateFeatureOptions(options);

        log(pc.cyan('\n🎯 Feature Generator\n'));

        // Detect & prompt
        const steps = createFeaturePipelineSteps();
        spinner.start('Detecting project setup...');
        const { detectProjectSetup } = await import('../detection');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        log(pc.dim(`  Redux: ${detection.hasRedux ? '✓' : '✗'}`));
        log(pc.dim(`  HTTP Client: ${detection.httpClient}`));
        log(pc.dim(`  i18n: ${detection.hasI18n ? '✓' : '✗'}\n`));

        const featureOptions = await promptForFeatureDetails(
          name,
          detection.hasRedux,
          detection.httpClient,
          options.skipStore,
          options.store,
          options.skipService,
          options.service,
        );

        const basePath = options.path || path.join('src', 'features');
        const featurePath = path.join(projectPath, basePath, featureOptions.featureName);

        const exists = await directoryExists(projectPath, featureOptions.featureName, basePath);
        if (exists) {
          logError(`Feature '${featureOptions.featureName}' already exists at ${basePath}!`);
          process.exit(1);
        }

        // Execute generation pipeline (generate → register API → register reducer)
        await executePipeline(steps.slice(1), {
          projectPath,
          spinner,
          featureName: featureOptions.featureName,
          basePath,
          featurePath,
          createStore: featureOptions.createStore,
          persistStore: featureOptions.persistStore,
          createService: featureOptions.createService,
          httpClient: featureOptions.selectedHttpClient,
          detection,
        });

        printFeatureSuccess(featureOptions, basePath);
      } catch (error) {
        spinner.fail('Feature generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};

const validateFeatureOptions = (options: FeatureCommandOptions) => {
  if (options.store && !['persist', 'no-persist'].includes(options.store)) {
    logError('Invalid --store option. Use: persist or no-persist');
    process.exit(1);
  }
  if (options.service && !['axios', 'fetch'].includes(options.service)) {
    logError('Invalid --service option. Use: axios or fetch');
    process.exit(1);
  }
  if (options.skipStore && options.store) {
    logError('Cannot use --skip-store and --store together');
    process.exit(1);
  }
  if (options.skipService && options.service) {
    logError('Cannot use --skip-service and --service together');
    process.exit(1);
  }
};

const printFeatureSuccess = (
  featureOptions: { featureName: string; createStore: boolean; createService: boolean },
  basePath: string,
) => {
  const displayPath = path.join(basePath, featureOptions.featureName);
  log(pc.green(`\n✨ Feature '${featureOptions.featureName}' created successfully!\n`));
  log(pc.dim('Generated files:'));
  log(pc.dim(`  📂 ${displayPath}/`));
  log(pc.dim(`     ├── components/`));
  log(pc.dim(`     ├── hooks/`));
  log(pc.dim(`     ├── types/`));
  if (featureOptions.createStore) log(pc.dim(`     ├── store/`));
  if (featureOptions.createService) log(pc.dim(`     ├── services/`));
  log(pc.dim(`     └── index.ts\n`));

  log(pc.cyan('Next steps:'));
  const importPath = basePath.replace(/^src\//, '@/');
  log(
    pc.dim(
      `  1. Import and use the feature: import { ${featureOptions.featureName} } from '${importPath}/${featureOptions.featureName}'`,
    ),
  );
  if (featureOptions.createStore) {
    log(pc.dim(`  2. Customize your Redux slice in: ${displayPath}/store/`));
  }
  if (featureOptions.createService) {
    log(
      pc.dim(
        `  3. Add API methods in: ${displayPath}/services/${featureOptions.featureName}.service.ts`,
      ),
    );
  }
  log('');
};
