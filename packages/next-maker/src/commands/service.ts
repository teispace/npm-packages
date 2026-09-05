import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { assertSafeRelativePath, assertSafeSegment, resolveInside } from '../config/path-safety';
import { fileExists } from '../core/files';
import { formatTouched } from '../core/format';
import { detectProjectSetup } from '../detection';
import { generateApi } from '../generators/api.generator';
import { registerApiEndpoints } from '../modifiers';

interface ServiceCommandOptions {
  feature?: string;
  actions?: boolean;
}

/**
 * `api` (alias `service`): add the data layer of a resource to a feature.
 * In v2 a "service" is the feature's `api/` folder: zod schema, query keys,
 * server DAL, client queries, and (by default) Server Actions.
 */
export const registerServiceCommand = (program: Command) => {
  program
    .command('api [name]')
    .alias('service')
    .description(
      'Generate api/{schema,keys,server,queries,actions}.ts for a resource inside a feature',
    )
    .option('--feature <path>', 'Feature directory (default: src/features/<name>)')
    .option('--no-actions', 'Skip actions.ts (read-only resource)')
    .action(async (name: string | undefined, options: ServiceCommandOptions) => {
      try {
        const projectPath = process.cwd();
        const startedAt = Date.now();
        log(pc.cyan('\n🔌 API Layer Generator\n'));

        if (!name) throw new Error('Pass the resource name, e.g. `next-maker api invoice`.');
        assertSafeSegment(name, 'resource name');
        if (options.feature) assertSafeRelativePath(options.feature, 'feature path');

        const detection = await detectProjectSetup(projectPath);
        if (!detection.hasQuery || !detection.hasActions) {
          throw new Error(
            'This generator needs @tanstack/react-query and next-safe-action (starter 2.x).',
          );
        }

        const featurePath = options.feature
          ? resolveInside(projectPath, options.feature)
          : resolveInside(projectPath, 'src', 'features', name);
        if (fileExists(path.join(featurePath, 'api', 'schema.ts'))) {
          throw new Error(`${path.relative(projectPath, featurePath)}/api already exists.`);
        }

        spinner.start('Generating api/ files...');
        const files = await generateApi({
          name,
          featurePath,
          withActions: options.actions !== false,
        });
        spinner.succeed('api/ generated');

        spinner.start('Registering API endpoints...');
        await registerApiEndpoints({ serviceName: name, projectPath });
        spinner.succeed('Endpoints registered in src/lib/config/app-apis.ts');

        await formatTouched(projectPath, startedAt);

        log(pc.green(`\n✨ ${path.relative(projectPath, featurePath)}/api ready.\n`));
        for (const file of files) log(pc.dim(`  ${file}`));
        log('');
      } catch (error) {
        spinner.fail('API generation failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
