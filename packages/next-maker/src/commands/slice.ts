import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { assertSafeRelativePath, assertSafeSegment, resolveInside } from '../config/path-safety';
import { kebabToPascal } from '../config/utils';
import { detectProjectSetup, directoryExists } from '../detection';
import { generateSlice, generateTest } from '../generators';
import { registerInRootReducer } from '../modifiers';
import { promptForSliceDetails } from '../prompts/slice.prompt';

interface SliceCommandOptions {
  path?: string;
  persist?: boolean;
  test?: boolean;
}

export const registerSliceCommand = (program: Command) => {
  program
    .command('slice [name]')
    .description('Generate a store slice (Redux or Zustand, whichever the project uses)')
    .option('--path <path>', 'Directory for the slice (default: src/store/slices/<name>)')
    .option('--persist', 'Persist the slice across reloads (Redux)')
    .option('--no-persist', 'Do not persist the slice')
    .option('--test', 'Also generate a sibling test file (Redux)')
    .option('--no-test', 'Skip test file generation')
    .action(async (name: string | undefined, options: SliceCommandOptions) => {
      try {
        const projectPath = process.cwd();
        log(pc.cyan('\n🔧 Slice Generator\n'));

        spinner.start('Detecting project setup...');
        const detection = await detectProjectSetup(projectPath);
        spinner.succeed('Project setup detected');

        if (detection.state === 'none') {
          throw new Error(
            'This project has no client store. Re-run init with a state store, or add one with `next-maker setup --set state=redux`.',
          );
        }
        log(pc.dim(`  state: ${detection.state}\n`));

        const sliceOptions = await promptForSliceDetails(
          name,
          detection.state === 'zustand' ? false : options.persist,
        );
        assertSafeSegment(sliceOptions.sliceName, 'slice name');
        if (options.path) assertSafeRelativePath(options.path, 'path');

        const basePath = options.path ?? path.join('src', 'store', 'slices');
        const slicePath = resolveInside(projectPath, basePath, sliceOptions.sliceName);
        if (await directoryExists(projectPath, sliceOptions.sliceName, basePath)) {
          throw new Error(`Slice '${sliceOptions.sliceName}' already exists at ${basePath}.`);
        }

        spinner.start('Generating slice files...');
        await generateSlice({
          name: sliceOptions.sliceName,
          outputPath: slicePath,
          persist: sliceOptions.persistSlice,
          state: detection.state,
        });
        spinner.succeed('Slice files generated');

        if (detection.state === 'redux') {
          spinner.start('Registering slice in the store...');
          await registerInRootReducer({
            projectPath,
            name: sliceOptions.sliceName,
            persist: sliceOptions.persistSlice,
            importPath: path.join(basePath, sliceOptions.sliceName),
          });
          spinner.succeed('Slice registered');

          if (options.test ?? detection.hasTests) {
            spinner.start('Generating test...');
            await generateTest({
              projectPath,
              sourceFile: path.join(slicePath, `${sliceOptions.sliceName}.slice.ts`),
              kind: 'slice',
              symbolName: sliceOptions.sliceName.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
            });
            spinner.succeed('Test generated');
          }
        }

        log(
          pc.green(
            `\n✨ Slice '${sliceOptions.sliceName}' created in ${basePath}/${sliceOptions.sliceName}/.\n`,
          ),
        );
        if (detection.state === 'zustand') {
          log(
            pc.yellow(
              `  ! Compose create${kebabToPascal(sliceOptions.sliceName)}Slice into AppState in src/store/index.ts`,
            ),
          );
          log('');
        }
      } catch (error) {
        spinner.fail('Slice generation failed');
        logError(`${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });
};
