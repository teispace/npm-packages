import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import type { Ora } from 'ora';
import pc from 'picocolors';
import {
  type Answers,
  type CompositionPlan,
  getPreset,
  loadInitConfig,
  parseSetFlags,
  presetNames,
  type StarterManifest,
} from '../composition';
import { log, logError, printBanner } from '../config';
import { onCancellation } from '../config/errorHandlers';
import { startSpinner } from '../config/spinner';
import { resolveStarterSource, type StarterSource } from '../config/starter';
import { deleteDirectory, fileExists } from '../core/files';
import { initializeGit } from '../core/git';
import { installDependencies, type PackageManager, runScript } from '../core/package-manager';
import {
  defaultIdentity,
  type ProjectIdentity,
  promptForIdentity,
  promptForOptions,
} from '../prompts/create-app.prompt';
import { composeProject, fetchAndPlan, replan } from '../services/init/scaffold.service';

interface InitCommandOptions {
  yes?: boolean;
  preset?: string;
  config?: string;
  set?: string[];
  packageManager?: string;
  starterPath?: string;
  dryRun?: boolean;
  install?: boolean;
  git?: boolean;
}

const VALID_PACKAGE_MANAGERS: ReadonlyArray<PackageManager> = ['pnpm', 'npm', 'yarn', 'bun'];

const validatePackageManager = (raw: string | undefined): PackageManager | undefined => {
  if (raw === undefined) return undefined;
  if (!VALID_PACKAGE_MANAGERS.includes(raw as PackageManager)) {
    throw new Error(
      `Invalid --package-manager "${raw}". Valid: ${VALID_PACKAGE_MANAGERS.join(', ')}.`,
    );
  }
  return raw as PackageManager;
};

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

export const registerAppCommand = (program: Command) => {
  program
    .command('init')
    .description('Create a new Next.js project from the Teispace starter')
    .argument('[name]', 'Project name')
    .option('-y, --yes', 'Skip every prompt and use the starter defaults')
    .option('--preset <name>', `Start from a preset (${presetNames().join(', ')})`)
    .option('--config <file>', 'Read identity and options from a JSON file (non-interactive)')
    .option(
      '--set <key=value>',
      'Override one starter option (repeatable), e.g. --set i18n=false',
      collect,
    )
    .option('--package-manager <pm>', `Package manager (${VALID_PACKAGE_MANAGERS.join(', ')})`)
    .option(
      '--starter-path <dir>',
      'Compose from a local starter checkout instead of the pinned tag',
    )
    .option('--dry-run', 'Print the composition plan and create nothing')
    .option('--no-install', 'Skip dependency installation')
    .option('--no-git', 'Skip git init')
    .action(async (name: string | undefined, options: InitCommandOptions) => {
      try {
        await createApp(name, options);
      } catch (err) {
        logError(`${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
};

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

const formatValue = (value: unknown): string =>
  Array.isArray(value) ? (value.length ? value.join(', ') : 'none') : String(value);

const printPlan = (
  manifest: StarterManifest,
  plan: CompositionPlan,
  forced: { option: string; reason: string }[],
) => {
  log(pc.bold('Options'));
  for (const [name, value] of Object.entries(plan.answers)) {
    const label = manifest.options[name]?.label ?? name;
    log(`  ${pc.dim(label.padEnd(44))} ${formatValue(value)}`);
  }
  for (const f of forced) log(pc.yellow(`  ! ${f.reason}; ${f.option} turned off`));
  log('');
  log(pc.bold('Composition'));
  log(`  ${pc.green('keep')}   ${plan.featuresOn.join(', ') || '(none)'}`);
  log(`  ${pc.red('drop')}   ${plan.featuresOff.join(', ') || '(none)'}`);
  if (plan.featureOverlays.length || plan.pmOverlays.length) {
    log(`  ${pc.cyan('overlay')} ${[...plan.pmOverlays, ...plan.featureOverlays].join(', ')}`);
  }
  if (plan.packages.length || plan.devPackages.length) {
    log(`  ${pc.red('uninstall')} ${[...plan.packages, ...plan.devPackages].join(', ')}`);
  }
  log('');
};

interface ResolvedInit {
  identity: ProjectIdentity;
  packageManager: PackageManager;
  suppliedOptions: Record<string, unknown>;
  interactive: boolean;
  install: boolean;
  git: boolean;
}

const resolveInputs = async (
  initialName: string | undefined,
  options: InitCommandOptions,
): Promise<ResolvedInit> => {
  const config = options.config ? await loadInitConfig(options.config) : undefined;
  const flagPm = validatePackageManager(options.packageManager ?? config?.packageManager);
  const presetAnswers: Answers = options.preset
    ? getPreset(options.preset)
    : config?.preset
      ? getPreset(config.preset)
      : {};
  const suppliedOptions: Record<string, unknown> = {
    ...presetAnswers,
    ...(config?.options ?? {}),
    ...parseSetFlags(options.set),
  };
  if (flagPm) suppliedOptions.packageManager = flagPm;

  const interactive = !(options.yes || config);
  const identity = interactive
    ? await promptForIdentity(initialName)
    : defaultIdentity(initialName, {
        projectName: config?.name,
        description: config?.description,
        author: config?.author,
        version: config?.version,
        email: config?.email,
        gitRemote: config?.gitRemote,
        readme: config?.readme,
        copyEnv: config?.copyEnv,
      });

  return {
    identity,
    packageManager: flagPm ?? 'pnpm',
    suppliedOptions,
    interactive,
    install: options.install !== false && config?.install !== false,
    git: options.git !== false && config?.git !== false,
  };
};

const createApp = async (
  initialName: string | undefined,
  options: InitCommandOptions,
): Promise<void> => {
  printBanner();
  const inputs = await resolveInputs(initialName, options);
  const { identity } = inputs;
  const projectPath = path.resolve(process.cwd(), identity.projectName);

  if (fileExists(projectPath)) {
    throw new Error(`Directory ${identity.projectName} already exists.`);
  }

  const active: { current: Ora | null } = { current: null };
  const cleanupProject = async () => {
    if (!fileExists(projectPath)) return;
    active.current?.stop();
    active.current = null;
    log(pc.yellow(`\nCleaning up ${identity.projectName}...`));
    await deleteDirectory(projectPath);
  };
  const deregisterCleanup = onCancellation(async () => {
    log(pc.red('\nProcess interrupted.'));
    await cleanupProject();
  });

  try {
    const source: StarterSource = resolveStarterSource({ starterPath: options.starterPath });
    let scaffold = await withStepSpinner(
      `Fetching starter (${source.location})...`,
      'Starter fetched.',
      () =>
        fetchAndPlan({
          projectPath,
          source,
          supplied: inputs.suppliedOptions,
          packageManager: inputs.packageManager,
        }),
      active,
    );
    log(pc.dim(`  ${scaffold.manifest.starter.name} ${scaffold.manifest.starter.version}`));
    log('');

    if (inputs.interactive) {
      const supplied = {
        ...inputs.suppliedOptions,
        ...(await promptForOptions(scaffold.manifest, scaffold.answers)),
      };
      if (options.packageManager) supplied.packageManager = options.packageManager;
      scaffold = replan(scaffold.manifest, supplied, inputs.packageManager);
      log('');
    }
    for (const name of scaffold.unknown) log(pc.yellow(`  ! unknown option "${name}" ignored`));
    const { packageManager, plan, manifest } = scaffold;

    printPlan(manifest, plan, scaffold.forced);

    if (options.dryRun) {
      deregisterCleanup();
      await deleteDirectory(projectPath);
      log(pc.cyan('Dry run: nothing was created.'));
      return;
    }

    await withStepSpinner(
      'Composing project...',
      'Project composed.',
      () => composeProject(projectPath, identity, scaffold, source),
      active,
    );

    if (inputs.install) {
      await withStepSpinner(
        `Installing dependencies with ${packageManager}...`,
        'Dependencies installed.',
        () => installDependencies(projectPath, packageManager),
        active,
      );
      await withStepSpinner(
        'Formatting...',
        'Formatted.',
        () => runScript(projectPath, packageManager, 'lint:fix'),
        active,
      );
    }

    if (identity.copyEnv && fileExists(path.join(projectPath, '.env.example'))) {
      await copyFile(path.join(projectPath, '.env.example'), path.join(projectPath, '.env'));
    }

    if (inputs.git) {
      await withStepSpinner(
        'Initializing git...',
        'Git initialized.',
        () => initializeGit(projectPath, identity.gitRemote, identity.pushToRemote),
        active,
      );
    }

    deregisterCleanup();
    log('');
    log(pc.green(`✨ ${identity.projectName} is ready.`));
    log('');
    log('Next:');
    log(pc.cyan(`  cd ${identity.projectName}`));
    if (!inputs.install) log(pc.cyan(`  ${packageManager} install`));
    log(
      pc.cyan(
        `  ${packageManager === 'pnpm' || packageManager === 'yarn' ? `${packageManager} dev` : `${packageManager} run dev`}`,
      ),
    );
    log('');
  } catch (err) {
    deregisterCleanup();
    active.current?.fail('Failed to create project.');
    active.current = null;
    await cleanupProject();
    throw err;
  }
};
