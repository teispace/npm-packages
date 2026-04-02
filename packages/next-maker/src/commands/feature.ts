import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { log, logError, spinner } from '../config';
import { promptForFeatureDetails } from '../prompts/feature.prompt';
import { detectProjectSetup, featureExists } from '../services/feature/detection.service';
import { generateFeatureStructure } from '../services/feature/templates.service';
import { registerFeatureInRootReducer } from '../services/feature/registration.service';
import { registerApiEndpoints } from '../services/common/api-registration.service';

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

        // Validate store option
        if (options.store && !['persist', 'no-persist'].includes(options.store)) {
          logError('Invalid --store option. Use: persist or no-persist');
          process.exit(1);
        }

        // Validate service option
        if (options.service && !['axios', 'fetch'].includes(options.service)) {
          logError('Invalid --service option. Use: axios or fetch');
          process.exit(1);
        }

        // Validate conflicting options
        if (options.skipStore && options.store) {
          logError('Cannot use --skip-store and --store together');
          process.exit(1);
        }

        if (options.skipService && options.service) {
          logError('Cannot use --skip-service and --service together');
          process.exit(1);
        }

        log(pc.cyan('\n🎯 Feature Generator\n'));

        // Step 1: Detect project setup
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        log(pc.dim(`  Redux: ${detection.hasRedux ? '✓' : '✗'}`));
        log(pc.dim(`  HTTP Client: ${detection.httpClient}`));
        log(pc.dim(`  i18n: ${detection.hasI18n ? '✓' : '✗'}\n`));

        // Step 2: Prompt for feature details
        const featureOptions = await promptForFeatureDetails(
          name,
          detection.hasRedux,
          detection.httpClient,
          options.skipStore,
          options.store,
          options.skipService,
          options.service,
        );

        // Step 3: Determine feature path
        const basePath = options.path || path.join('src', 'features');
        const featurePath = path.join(projectPath, basePath, featureOptions.featureName);

        // Check if feature already exists
        const exists = await featureExists(projectPath, featureOptions.featureName, basePath);
        if (exists) {
          logError(`Feature '${featureOptions.featureName}' already exists at ${basePath}!`);
          process.exit(1);
        }

        // Step 4: Generate feature structure
        spinner.start('Generating feature files...');

        await generateFeatureStructure({
          featureName: featureOptions.featureName,
          featurePath,
          createStore: featureOptions.createStore,
          persistStore: featureOptions.persistStore,
          createService: featureOptions.createService,
          httpClient: featureOptions.selectedHttpClient,
        });

        spinner.succeed('Feature files generated');

        // Step 5: Register API endpoints if service was created
        if (featureOptions.createService) {
          spinner.start('Registering API endpoints...');
          await registerApiEndpoints({
            serviceName: featureOptions.featureName,
            projectPath,
          });
          spinner.succeed('API endpoints registered');
        }

        // Step 6: Register in rootReducer if store was created
        if (featureOptions.createStore && detection.hasRedux) {
          spinner.start('Registering feature in rootReducer...');
          await registerFeatureInRootReducer(
            projectPath,
            featureOptions.featureName,
            featureOptions.persistStore,
            basePath,
          );
          spinner.succeed('Feature registered in rootReducer');
        }

        // Success message
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
      } catch (error) {
        spinner.fail('Feature generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
