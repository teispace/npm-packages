import path from 'node:path';
import type { Command } from 'commander';
import type { Ora } from 'ora';
import pc from 'picocolors';
import { log, logError, printBanner } from '../config';
import { startSpinner } from '../config/spinner';
import { deleteDirectory, fileExists } from '../core/files';
import { initializeGit } from '../core/git';
import { installDependencies, type PackageManager, runScript } from '../core/package-manager';
import {
  defaultProjectAnswers,
  type ProjectPrompts,
  promptForProjectDetails,
} from '../prompts/create-app.prompt';
import { cleanupFeatures } from '../services/init/cleanup';
import { configurePackageJson } from '../services/init/config.service';
import { setupDevTools } from '../services/init/devtools.service';
import { generateLayout, generateRootProvider } from '../services/init/providers.service';
import { cloneTemplate } from '../services/init/template.service';

interface InitCommandOptions {
  yes?: boolean;
  packageManager?: string;
}

const VALID_PACKAGE_MANAGERS: ReadonlyArray<PackageManager> = ['npm', 'yarn', 'pnpm', 'bun'];

const validatePackageManagerOverride = (raw: string | undefined): PackageManager | undefined => {
  if (raw === undefined) return undefined;
  if (!VALID_PACKAGE_MANAGERS.includes(raw as PackageManager)) {
    throw new Error(
      `Invalid --package-manager "${raw}". Valid: ${VALID_PACKAGE_MANAGERS.join(', ')}.`,
    );
  }
  return raw as PackageManager;
};

export const registerAppCommand = (program: Command) => {
  program
    .command('init')
    .description('Initialize a new Next.js project')
    .argument('[name]', 'Project name')
    .option('-y, --yes', 'Skip all prompts and use the recommended production defaults')
    .option(
      '--package-manager <pm>',
      `Override the package manager (one of: ${VALID_PACKAGE_MANAGERS.join(', ')})`,
    )
    .action(async (name: string | undefined, options: InitCommandOptions) => {
      try {
        const packageManager = validatePackageManagerOverride(options.packageManager);
        await createApp(name, { yes: options.yes ?? false, packageManager });
      } catch (err) {
        logError(`${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
};

/**
 * Run a step with a dedicated spinner, ensuring at most one is active at a
 * time. Sub-services that manage their own spinners must be called
 * *outside* this helper — wrapping them would create concurrent spinners
 * (ora 9.4+ surfaces this as a runtime warning).
 */
const withStepSpinner = async <T>(
  text: string,
  successText: string,
  fn: () => Promise<T>,
  ref: { current: Ora | null },
): Promise<T> => {
  const spinner = startSpinner(text);
  ref.current = spinner;
  try {
    const result = await fn();
    spinner.succeed(successText);
    return result;
  } finally {
    if (ref.current === spinner) ref.current = null;
  }
};

interface CreateAppFlags {
  yes: boolean;
  packageManager?: PackageManager;
}

const summariseDefaults = (answers: ProjectPrompts): void => {
  const features: string[] = [];
  if (answers.darkMode) features.push('dark mode');
  if (answers.redux) features.push('redux');
  if (answers.i18n) features.push('i18n');
  if (answers.tests) features.push('tests');
  if (answers.reactCompiler) features.push('react-compiler');
  if (answers.preCommitHooks) features.push('pre-commit hooks');
  if (answers.commitizen) features.push('commitizen');
  if (answers.httpClient !== 'none') features.push(`http (${answers.httpClient})`);

  log(pc.dim('Defaults applied (run `next-maker remove <feature>` to undo any of them):'));
  log(pc.dim(`  package manager : ${answers.packageManager}`));
  log(pc.dim(`  features        : ${features.join(', ')}`));
  log('');
};

const createApp = async (initialName: string | undefined, flags: CreateAppFlags): Promise<void> => {
  printBanner();

  let answers: ProjectPrompts;
  if (flags.yes) {
    answers = defaultProjectAnswers(initialName, {
      packageManager: flags.packageManager,
    });
    log(pc.cyan(`✨ Bootstrapping ${answers.projectName} with the recommended defaults`));
    log('');
    summariseDefaults(answers);
  } else {
    log('Welcome to the Teispace Next.js App Creator!');
    log('');
    answers = await promptForProjectDetails(initialName);
    if (flags.packageManager) {
      answers = { ...answers, packageManager: flags.packageManager };
    }
  }

  const projectPath = path.resolve(process.cwd(), answers.projectName);

  if (fileExists(projectPath)) {
    console.error(pc.red(`Error: Directory ${answers.projectName} already exists.`));
    process.exit(1);
  }

  // Tracks the *currently* active spinner (if any) so signal/cleanup can
  // halt it cleanly. Only one of our spinners is alive at a time.
  const active: { current: Ora | null } = { current: null };

  const performCleanup = async () => {
    if (fileExists(projectPath)) {
      active.current?.stop();
      active.current = null;
      console.log(pc.yellow(`\nCleaning up: Deleting directory ${answers.projectName}...`));
      try {
        await deleteDirectory(projectPath);
        console.log(pc.green('Cleanup successful.'));
      } catch (cleanupErr) {
        console.error(pc.red(`Failed to clean up directory ${answers.projectName}:`), cleanupErr);
      }
    }
  };

  const handleSignal = async () => {
    console.log(pc.red('\nProcess interrupted. Cleaning up...'));
    await performCleanup();
    process.exit(1);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  try {
    // 1–3. Each of these owns its own spinner; do not wrap them.
    await cloneTemplate(projectPath);
    await configurePackageJson(projectPath, answers);
    await cleanupFeatures(projectPath, answers);

    // 4. Providers + layout — silent under one outer spinner.
    await withStepSpinner(
      'Generating providers and layout...',
      'Providers and layout generated.',
      async () => {
        await generateRootProvider(projectPath, answers);
        await generateLayout(projectPath, answers);
      },
      active,
    );

    // 5. DevTools (community files, Docker, hooks, etc.) — no inner spinners.
    await withStepSpinner(
      'Setting up developer tools...',
      'Developer tools configured.',
      () => setupDevTools(projectPath, answers),
      active,
    );

    // 6. Git
    await withStepSpinner(
      'Initializing Git...',
      'Git initialized.',
      () => initializeGit(projectPath, answers.gitRemote, answers.pushToRemote),
      active,
    );

    // 7. Install
    await withStepSpinner(
      'Installing dependencies...',
      'Dependencies installed.',
      () => installDependencies(projectPath, answers.packageManager),
      active,
    );

    // 8. Format + Lint (biome check --write does both)
    await withStepSpinner(
      'Formatting and linting...',
      'Formatted.',
      () => runScript(projectPath, answers.packageManager, 'lint:fix'),
      active,
    );

    // 9. Copy .env.example → .env (cheap, no spinner needed)
    if (answers.copyEnv) {
      const envExamplePath = path.join(projectPath, '.env.example');
      const envPath = path.join(projectPath, '.env');
      if (fileExists(envExamplePath)) {
        const fs = await import('node:fs/promises');
        await fs.copyFile(envExamplePath, envPath);
      }
    }

    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);

    log('');
    log(pc.green(`✨ Project ${answers.projectName} created successfully!`));
    log('');
    log('To get started:');
    log(pc.cyan(`  cd ${answers.projectName}`));
    log(
      pc.cyan(
        `  ${answers.packageManager === 'npm' ? 'npm run dev' : `${answers.packageManager} dev`}`,
      ),
    );
    log('');
  } catch (err) {
    active.current?.fail('Failed to create project.');
    active.current = null;
    console.error(err);
    await performCleanup();
    process.exit(1);
  }
};
