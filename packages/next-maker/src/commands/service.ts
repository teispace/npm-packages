import { Command } from 'commander';
import pc from 'picocolors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { log, logError, spinner } from '../config';
import { promptForServiceDetails } from '../prompts/service.prompt';
import { detectProjectSetup, fileExistsAt } from '../detection';
import { executePipeline, createServicePipelineSteps } from '../pipelines';
import { generateCrudService } from '../generators';
import { registerCrudApiEndpoints } from '../modifiers/crud-api-registration.modifier';

interface ServiceCommandOptions {
  path?: string;
  axios?: boolean;
  fetch?: boolean;
  crud?: boolean;
}

export const registerServiceCommand = (program: Command) => {
  program
    .command('service [name]')
    .description('Generate an API service')
    .option('--path <path>', 'Custom path for service generation (default: create new feature)')
    .option('--axios', 'Use Axios HTTP client')
    .option('--fetch', 'Use Fetch HTTP client')
    .option('--crud', 'Generate full CRUD service (getAll, getById, create, update, delete)')
    .action(async (name: string | undefined, options: ServiceCommandOptions) => {
      try {
        const projectPath = process.cwd();

        if (options.axios && options.fetch) {
          logError('Cannot use --axios and --fetch together');
          process.exit(1);
        }

        log(pc.cyan('\n🔧 Service Generator\n'));

        // Detect and validate HTTP clients
        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        if (detection.httpClient === 'none') {
          spinner.fail('No HTTP client is setup in this project');
          logError('Please setup either AxiosClient or FetchClient first');
          log(pc.dim('\nCheck: lib/utils/http/axios-client or lib/utils/http/fetch-client\n'));
          process.exit(1);
        }

        const availableClients: string[] = [];
        if (detection.httpClient === 'axios' || detection.httpClient === 'both') {
          availableClients.push('Axios ✓');
        }
        if (detection.httpClient === 'fetch' || detection.httpClient === 'both') {
          availableClients.push('Fetch ✓');
        }
        log(pc.dim(`  HTTP Clients: ${availableClients.join(', ')}\n`));

        // Prompt and resolve paths
        const serviceOptions = await promptForServiceDetails(
          name,
          options.axios,
          options.fetch,
          detection.httpClient,
        );

        const { basePath, servicePath } = resolveServicePaths(
          projectPath,
          serviceOptions.serviceName,
          options.path,
        );

        if (!existsSync(servicePath)) {
          await mkdir(servicePath, { recursive: true });
        }

        const exists = fileExistsAt(
          projectPath,
          basePath,
          `${serviceOptions.serviceName}.service.ts`,
        );
        if (exists) {
          logError(`Service '${serviceOptions.serviceName}' already exists at ${basePath}!`);
          process.exit(1);
        }

        // Execute generation
        if (options.crud) {
          spinner.start('Generating CRUD service files...');
          await generateCrudService({
            name: serviceOptions.serviceName,
            outputPath: servicePath,
            httpClient: serviceOptions.httpClient,
          });
          spinner.succeed('CRUD service files generated');

          spinner.start('Registering CRUD API endpoints...');
          await registerCrudApiEndpoints(projectPath, serviceOptions.serviceName);
          spinner.succeed('CRUD API endpoints registered');
        } else {
          await executePipeline(createServicePipelineSteps(), {
            projectPath,
            spinner,
            serviceName: serviceOptions.serviceName,
            servicePath,
            httpClient: serviceOptions.httpClient,
          });
        }

        printServiceSuccess(serviceOptions, basePath, !!options.crud);
      } catch (error) {
        spinner.fail('Service generation failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};

const resolveServicePaths = (
  projectPath: string,
  serviceName: string,
  customPath?: string,
): { basePath: string; servicePath: string } => {
  let basePath: string;

  if (customPath) {
    const cleanPath = customPath.replace(/^src\//, '');
    if (cleanPath.startsWith('features/')) {
      const featureName = cleanPath.split('/')[1];
      basePath = path.join('src', 'features', featureName, 'services');
    } else {
      basePath = path.join('src', cleanPath);
    }
  } else {
    basePath = path.join('src', 'features', serviceName, 'services');
  }

  return {
    basePath,
    servicePath: path.join(projectPath, basePath),
  };
};

const printServiceSuccess = (
  serviceOptions: { serviceName: string; httpClient: string },
  basePath: string,
  isCrud: boolean = false,
) => {
  const displayPath = path.join(basePath, `${serviceOptions.serviceName}.service.ts`);
  log(
    pc.green(
      `\n✨ ${isCrud ? 'CRUD ' : ''}Service '${serviceOptions.serviceName}' created successfully!\n`,
    ),
  );
  log(pc.dim('Generated files:'));
  log(pc.dim(`  📄 ${displayPath}\n`));

  log(pc.cyan('Next steps:'));
  const importPath = basePath.replace(/^src\//, '@/');
  log(
    pc.dim(
      `  1. Import service: import { ${serviceOptions.serviceName}Service } from '${importPath}/${serviceOptions.serviceName}.service'`,
    ),
  );
  if (isCrud) {
    log(pc.dim(`  2. Available methods: getAll, getById, create, update, delete`));
    log(pc.dim(`  3. Update DTO types in the service file`));
  } else {
    log(
      pc.dim(
        `  2. Use in component: const data = await ${serviceOptions.serviceName}Service.getAll()`,
      ),
    );
  }
  log('');
};
