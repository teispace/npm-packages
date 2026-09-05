import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { assertSafeRelativePath, assertSafeSegment, resolveInside } from '../config/path-safety';
import { kebabToPascal } from '../config/utils';
import { formatTouched } from '../core/format';
import { detectProjectSetup, directoryExists } from '../detection';
import { generateFeature } from '../generators';
import { addTranslationNamespace, registerApiEndpoints, registerInRootReducer } from '../modifiers';
import { promptForFeatureDetails } from '../prompts/feature.prompt';

interface FeatureCommandOptions {
  api?: boolean;
  store?: boolean;
  persist?: boolean;
  path?: string;
}

export const registerFeatureCommand = (program: Command) => {
  program
    .command('feature [name]')
    .description('Generate a feature module (api/, components/, store/, index.ts, server.ts)')
    .option('--api', 'Generate the api/ layer: schema, DAL, Server Actions, queries')
    .option('--no-api', 'Skip the api/ layer')
    .option(
      '--store',
      'Generate a client-state slice (Redux or Zustand, whichever the project uses)',
    )
    .option('--no-store', 'Skip the slice')
    .option('--persist', 'Persist the Redux slice across reloads')
    .option('--no-persist', 'Do not persist the slice')
    .option('--path <path>', 'Base directory (default: src/features)')
    .action(async (name: string | undefined, options: FeatureCommandOptions) => {
      try {
        const projectPath = process.cwd();
        const startedAt = Date.now();
        log(pc.cyan('\n🎯 Feature Generator\n'));

        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');
        log(
          pc.dim(
            `  state: ${detection.state}   i18n: ${detection.hasI18n ? '✓' : '✗'}   tests: ${detection.hasTests ? '✓' : '✗'}\n`,
          ),
        );

        const feature = await promptForFeatureDetails(name, detection.state, {
          api: options.api,
          store: options.store,
          persist: options.persist,
        });

        assertSafeSegment(feature.featureName, 'feature name');
        if (options.path) assertSafeRelativePath(options.path, 'path');
        const basePath = options.path || path.join('src', 'features');
        const featurePath = resolveInside(projectPath, basePath, feature.featureName);

        if (await directoryExists(projectPath, feature.featureName, basePath)) {
          logError(`Feature '${feature.featureName}' already exists at ${basePath}.`);
          process.exit(1);
        }

        spinner.start('Generating feature files...');
        await generateFeature({
          name: feature.featureName,
          outputPath: featurePath,
          createStore: feature.createStore,
          persistStore: feature.persistStore,
          createApi: feature.createApi,
          state: detection.state,
          hasI18n: detection.hasI18n,
          hasTests: detection.hasTests,
        });
        spinner.succeed('Feature files generated');

        if (detection.hasI18n) {
          await addTranslationNamespace(projectPath, kebabToPascal(feature.featureName));
        }

        if (feature.createApi) {
          spinner.start('Registering API endpoints...');
          await registerApiEndpoints({ serviceName: feature.featureName, projectPath });
          spinner.succeed('API endpoints registered');
        }

        if (feature.createStore && detection.state === 'redux') {
          spinner.start('Registering slice in the store...');
          await registerInRootReducer({
            projectPath,
            name: feature.featureName,
            persist: feature.persistStore,
            importPath: path.join(basePath, feature.featureName, 'store'),
          });
          spinner.succeed('Slice registered');
        }

        await formatTouched(projectPath, startedAt);

        printFeatureSuccess(feature, basePath, detection.state);
      } catch (error) {
        spinner.fail('Feature generation failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};

const printFeatureSuccess = (
  feature: { featureName: string; createStore: boolean; createApi: boolean },
  basePath: string,
  state: string,
) => {
  const displayPath = path.join(basePath, feature.featureName);
  log(pc.green(`\n✨ Feature '${feature.featureName}' created.\n`));
  log(pc.dim(`  ${displayPath}/`));
  if (feature.createApi)
    log(pc.dim('    api/            schema, keys, server (DAL), actions, queries'));
  log(pc.dim('    components/'));
  if (!feature.createApi) log(pc.dim('    hooks/'));
  if (feature.createStore) log(pc.dim('    store/'));
  log(pc.dim('    types/'));
  log(pc.dim('    index.ts        client-safe barrel'));
  if (feature.createApi) log(pc.dim('    server.ts       server-only barrel'));
  log('');
  log(pc.cyan('Next:'));
  if (feature.createApi) {
    log(
      pc.dim(
        `  1. Adjust the contracts in ${displayPath}/api/schema.ts and the paths in src/lib/config/app-apis.ts`,
      ),
    );
    log(
      pc.dim(
        `  2. Read in a Server Component: import { list${pascal(feature.featureName)}s } from '@/features/${feature.featureName}/server'`,
      ),
    );
    log(
      pc.dim(
        `  3. Prefetch + hydrate for the client list: prefetchQuery(${camel(feature.featureName)}ListQuery())`,
      ),
    );
  }
  if (feature.createStore && state === 'zustand') {
    log(
      pc.yellow(
        `  ! Compose create${pascal(feature.featureName)}Slice into AppState in src/store/index.ts`,
      ),
    );
  }
  log('');
};

const camel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const pascal = kebabToPascal;
