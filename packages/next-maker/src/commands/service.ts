import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { log, logError, spinner } from '../config';
import { promptForServiceDetails } from '../prompts/service.prompt';
import { detectProjectSetup } from '../services/feature/detection.service';
import { generateServiceFiles } from '../services/service/service.service';
import { serviceExists } from '../services/service/detection.service';

interface ServiceCommandOptions {
  path?: string;
  axios?: boolean;
  fetch?: boolean;
}

export const registerServiceCommand = (program: Command) => {
  program
    .command('service [name]')
    .description('Generate an API service')
    .option('--path <path>', 'Custom path for service generation (default: create new feature)')
    .option('--axios', 'Use Axios HTTP client')
    .option('--fetch', 'Use Fetch HTTP client')
    .action(async (name: string | undefined, options: ServiceCommandOptions) => {
      try {
        const projectPath = process.cwd();

        // Validate conflicting options
        if (options.axios && options.fetch) {
          logError('Cannot use --axios and --fetch together');
          process.exit(1);
        }

        log(pc.cyan('\n🔧 Service Generator\n'));

        // Step 1: Detect project setup
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        // Step 2: Check if HTTP clients are setup
        if (detection.httpClient === 'none') {
          spinner.fail('No HTTP client is setup in this project');
          logError('Please setup either AxiosClient or FetchClient first');
          log(pc.dim('\nCheck: lib/utils/http/axios-client or lib/utils/http/fetch-client\n'));
          process.exit(1);
        }

        // Display available clients
        const availableClients: string[] = [];
        if (detection.httpClient === 'axios' || detection.httpClient === 'both') {
          availableClients.push('Axios ✓');
        }
        if (detection.httpClient === 'fetch' || detection.httpClient === 'both') {
          availableClients.push('Fetch ✓');
        }
        log(pc.dim(`  HTTP Clients: ${availableClients.join(', ')}\n`));

        // Step 3: Prompt for service details
        const serviceOptions = await promptForServiceDetails(
          name,
          options.axios,
          options.fetch,
          detection.httpClient,
        );

        // Step 4: Determine service path (feature-first approach)
        let basePath: string;
        let featureName: string;
        let servicePath: string;

        if (options.path) {
          // Custom path provided
          const customPath = options.path.replace(/^src\//, '');

          // Check if custom path is a feature
          if (customPath.startsWith('features/')) {
            // Extract feature name and ensure services subdirectory
            const parts = customPath.split('/');
            featureName = parts[1]; // features/featureName/...
            basePath = path.join('src', 'features', featureName, 'services');
            servicePath = path.join(projectPath, basePath);
          } else {
            // Non-feature custom path - use as-is
            basePath = path.join('src', customPath);
            featureName = customPath.split('/')[0]; // First directory as feature name
            servicePath = path.join(projectPath, basePath);
          }
        } else {
          // Default: Create new feature with services
          featureName = serviceOptions.serviceName;
          basePath = path.join('src', 'features', featureName, 'services');
          servicePath = path.join(projectPath, basePath);
        }

        // Step 5: Ensure feature and services directories exist
        if (!existsSync(servicePath)) {
          await mkdir(servicePath, { recursive: true });
        }

        // Check if service already exists
        const exists = await serviceExists(projectPath, serviceOptions.serviceName, basePath);
        if (exists) {
          logError(`Service '${serviceOptions.serviceName}' already exists at ${basePath}!`);
          process.exit(1);
        }

        // Step 6: Generate service files
        spinner.start('Generating service files...');
        await generateServiceFiles({
          serviceName: serviceOptions.serviceName,
          servicePath,
          httpClient: serviceOptions.httpClient,
        });
        spinner.succeed('Service files generated');

        // Success message
        const displayPath = path.join(basePath, `${serviceOptions.serviceName}.service.ts`);
        log(pc.green(`\n✨ Service '${serviceOptions.serviceName}' created successfully!\n`));
        log(pc.dim('Generated files:'));
        log(pc.dim(`  📄 ${displayPath}\n`));

        log(pc.cyan('Next steps:'));
        const importPath = basePath.replace(/^src\//, '@/');
        log(
          pc.dim(
            `  1. Import service: import { ${serviceOptions.serviceName}Service } from '${importPath}/${serviceOptions.serviceName}.service'`,
          ),
        );
        log(
          pc.dim(
            `  2. Use in component: const data = await ${serviceOptions.serviceName}Service.getAll()`,
          ),
        );
        log('');
      } catch (error) {
        spinner.fail('Service generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
