import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import type { Ora } from 'ora';
import pc from 'picocolors';
import { getPreset, parseSetFlags, presetNames } from '../composition';
import { log, logError, printBanner } from '../config';
import { onCancellation } from '../config/errorHandlers';
import { startSpinner } from '../config/spinner';
import { resolveStarterSource } from '../config/starter';
import { deleteDirectory, fileExists } from '../core/files';
import { initializeGit } from '../core/git';
import { installDependencies, runScript } from '../core/package-manager';
import {
  assertValidProjectName,
  defaultIdentity,
  type ProjectIdentity,
  promptForOptions,
} from '../prompts/create-app.prompt';
import {
  composeProject,
  fetchAndPlan,
  replan,
  type ScaffoldPlan,
} from '../services/init/scaffold.service';
import {
  appDockerfile,
  applyCatalog,
  catalogFor,
  catalogYaml,
  pnpmWorkspaceYaml,
  rootBiomeJson,
  rootCiYaml,
  rootCommitlint,
  rootDockerCompose,
  rootDockerignore,
  rootGitignore,
  rootHusky,
  rootLintStaged,
  rootPackageJson,
  rootReadme,
  turboJson,
  type WorkspaceTemplateParams,
} from '../services/workspace/templates';

interface WorkspaceCommandOptions {
  apps?: string;
  yes?: boolean;
  preset?: string;
  set?: string[];
  starterPath?: string;
  install?: boolean;
  git?: boolean;
  ci?: boolean;
  hooks?: boolean;
  docker?: boolean;
  catalog?: boolean;
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/** Options that belong to the workspace root, not to an app. */
const ROOT_OWNED: Record<string, unknown> = {
  hooks: false,
  commitizen: false,
  ci: false,
  docker: false,
  githubTemplates: false,
  communityFiles: [],
};

/**
 * `workspace <name>`: a pnpm + Turborepo monorepo with one starter app per
 * `--apps` entry. Every app is composed with the same answers; git hooks,
 * commit linting, CI, Docker, the lockfile, and shared dependency ranges
 * (the pnpm catalog) live at the root.
 */
export const registerWorkspaceCommand = (program: Command) => {
  program
    .command('workspace <name>')
    .alias('monorepo')
    .description('Create a pnpm + Turborepo workspace with one starter app per --apps entry')
    .option('--apps <names>', 'Comma-separated app names', 'web,admin')
    .option('-y, --yes', 'Skip prompts and use the starter defaults for every app')
    .option('--preset <name>', `Preset for the apps (${presetNames().join(', ')})`)
    .option('--set <key=value>', 'Starter option applied to every app (repeatable)', collect)
    .option('--starter-path <dir>', 'Compose from a local starter checkout')
    .option('--docker', 'Per-app Dockerfiles (turbo prune) and a root docker-compose.yml')
    .option('--no-catalog', 'Keep dependency ranges in each app instead of the pnpm catalog')
    .option('--no-install', 'Skip dependency installation')
    .option('--no-git', 'Skip git init')
    .option('--no-ci', 'Skip the root GitHub Actions workflow')
    .option('--no-hooks', 'Skip root git hooks (Husky, lint-staged, commitlint)')
    .action(async (name: string, options: WorkspaceCommandOptions) => {
      try {
        await createWorkspace(name, options);
      } catch (err) {
        logError(`${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
};

const withStepSpinner = async <T>(
  text: string,
  done: string,
  fn: () => Promise<T>,
  ref: { current: Ora | null },
): Promise<T> => {
  const spinner = startSpinner(text);
  ref.current = spinner;
  try {
    const result = await fn();
    spinner.succeed(done);
    return result;
  } finally {
    if (ref.current === spinner) ref.current = null;
  }
};

const parseApps = (raw: string): string[] => {
  const apps = raw
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  if (apps.length === 0) throw new Error('Pass at least one app name with --apps.');
  for (const app of apps) assertValidProjectName(app);
  if (new Set(apps).size !== apps.length) throw new Error('App names must be unique.');
  return apps;
};

const createWorkspace = async (name: string, options: WorkspaceCommandOptions): Promise<void> => {
  printBanner();
  assertValidProjectName(name);
  const apps = parseApps(options.apps ?? 'web,admin');
  const rootPath = path.resolve(process.cwd(), name);
  if (fileExists(rootPath)) throw new Error(`Directory ${name} already exists.`);

  const supplied: Record<string, unknown> = {
    ...(options.preset ? getPreset(options.preset) : {}),
    ...parseSetFlags(options.set),
  };
  for (const [key, value] of Object.entries(ROOT_OWNED)) {
    if (supplied[key] !== undefined && JSON.stringify(supplied[key]) !== JSON.stringify(value)) {
      log(pc.yellow(`  ! ${key} is managed at the workspace root; ignoring --set ${key}`));
    }
    supplied[key] = value;
  }
  supplied.packageManager = 'pnpm';

  const active: { current: Ora | null } = { current: null };
  const cleanup = async () => {
    if (!fileExists(rootPath)) return;
    active.current?.stop();
    active.current = null;
    log(pc.yellow(`\nCleaning up ${name}...`));
    await deleteDirectory(rootPath);
  };
  const deregister = onCancellation(async () => {
    log(pc.red('\nProcess interrupted.'));
    await cleanup();
  });

  try {
    await mkdir(path.join(rootPath, 'apps'), { recursive: true });
    await mkdir(path.join(rootPath, 'packages'), { recursive: true });
    const source = resolveStarterSource({ starterPath: options.starterPath });

    // Compose the first app; it also yields the manifest for prompting and
    // the starter files the root borrows (workspace yaml, nvmrc, npmrc).
    const firstPath = path.join(rootPath, 'apps', apps[0]);
    let scaffold: ScaffoldPlan = await withStepSpinner(
      `Fetching starter (${source.location})...`,
      'Starter fetched.',
      () => fetchAndPlan({ projectPath: firstPath, source, supplied, packageManager: 'pnpm' }),
      active,
    );
    if (!options.yes) {
      const answers = await promptForOptions(scaffold.manifest, scaffold.answers);
      scaffold = replan(
        scaffold.manifest,
        { ...answers, ...ROOT_OWNED, packageManager: 'pnpm' },
        'pnpm',
      );
      log('');
    }
    for (const f of scaffold.forced) log(pc.yellow(`  ! ${f.reason}; ${f.option} turned off`));

    const starterPkg = JSON.parse(await readFile(path.join(firstPath, 'package.json'), 'utf-8'));
    const starterWorkspaceYaml = await readFile(
      path.join(firstPath, 'pnpm-workspace.yaml'),
      'utf-8',
    );
    const borrow: Record<string, string> = {};
    for (const file of ['.nvmrc', '.npmrc', '.editorconfig']) {
      if (fileExists(path.join(firstPath, file))) {
        borrow[file] = await readFile(path.join(firstPath, file), 'utf-8');
      }
    }

    const identityFor = (app: string): ProjectIdentity =>
      defaultIdentity(app, {
        projectName: app,
        description: `${app} app of ${name}`,
        readme: true,
        copyEnv: true,
      });

    await withStepSpinner(
      `Composing apps/${apps[0]}...`,
      `apps/${apps[0]} composed.`,
      () => composeProject(firstPath, identityFor(apps[0]), scaffold, source),
      active,
    );
    for (const app of apps.slice(1)) {
      const appPath = path.join(rootPath, 'apps', app);
      await withStepSpinner(
        `Composing apps/${app}...`,
        `apps/${app} composed.`,
        async () => {
          const plan = await fetchAndPlan({
            projectPath: appPath,
            source,
            supplied: scaffold.answers,
            packageManager: 'pnpm',
          });
          await composeProject(appPath, identityFor(app), plan, source);
        },
        active,
      );
    }

    // Per-app artefacts that belong to the root in a workspace. Each app
    // keeps its `.gitignore`: Biome resolves `vcs.useIgnoreFile` against the
    // app directory and errors without one.
    const appPkgs: Record<string, unknown>[] = [];
    for (const app of apps) {
      const appPath = path.join(rootPath, 'apps', app);
      for (const file of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', '.npmrc', '.nvmrc']) {
        await rm(path.join(appPath, file), { force: true });
      }
      const appPkg = JSON.parse(await readFile(path.join(appPath, 'package.json'), 'utf-8'));
      delete appPkg.packageManager;
      delete appPkg.engines;
      appPkgs.push(appPkg);
    }
    // Shared ranges move to the pnpm catalog so one line bumps them everywhere.
    const catalog = options.catalog === false ? {} : catalogFor(appPkgs);
    for (const [i, app] of apps.entries()) {
      const pkg = applyCatalog(appPkgs[i], catalog);
      await writeFile(
        path.join(rootPath, 'apps', app, 'package.json'),
        `${JSON.stringify(pkg, null, 2)}\n`,
      );
      if (options.docker) {
        await writeFile(path.join(rootPath, 'apps', app, 'Dockerfile'), appDockerfile(app));
      }
    }

    await withStepSpinner(
      'Writing workspace root...',
      'Workspace root written.',
      async () => {
        const params: WorkspaceTemplateParams = {
          name,
          description: `${name} workspace`,
          author: starterPkg.author ?? '',
          apps,
          packageManager: 'pnpm',
          packageManagerPin: starterPkg.packageManager ?? 'pnpm@11.25.0',
          nodeEngine: starterPkg.engines?.node ?? '>=24.0.0',
          turboVersion: '^2.10.0',
          biomeVersion: starterPkg.devDependencies?.['@biomejs/biome'] ?? '^2.5.0',
          hooks: options.hooks !== false,
          huskyVersion: starterPkg.devDependencies?.husky,
          lintStagedVersion: starterPkg.devDependencies?.['lint-staged'],
          commitlintCliVersion: starterPkg.devDependencies?.['@commitlint/cli'],
          commitlintConfigVersion: starterPkg.devDependencies?.['@commitlint/config-conventional'],
        };
        await writeFile(path.join(rootPath, 'package.json'), rootPackageJson(params));
        await writeFile(
          path.join(rootPath, 'pnpm-workspace.yaml'),
          pnpmWorkspaceYaml(starterWorkspaceYaml) + catalogYaml(catalog),
        );
        await writeFile(path.join(rootPath, 'turbo.json'), turboJson());
        await writeFile(path.join(rootPath, 'biome.json'), rootBiomeJson(params.biomeVersion));
        await writeFile(path.join(rootPath, '.gitignore'), rootGitignore());
        await writeFile(
          path.join(rootPath, 'README.md'),
          rootReadme(params, scaffold.manifest.starter.version),
        );
        await writeFile(path.join(rootPath, 'packages', '.gitkeep'), '');
        for (const [file, content] of Object.entries(borrow)) {
          await writeFile(path.join(rootPath, file), content);
        }
        if (options.docker) {
          await writeFile(path.join(rootPath, 'docker-compose.yml'), rootDockerCompose(apps));
          await writeFile(path.join(rootPath, '.dockerignore'), rootDockerignore());
        }
        if (options.ci !== false) {
          await mkdir(path.join(rootPath, '.github', 'workflows'), { recursive: true });
          await writeFile(path.join(rootPath, '.github', 'workflows', 'ci.yml'), rootCiYaml());
        }
        if (options.hooks !== false) {
          await writeFile(path.join(rootPath, '.lintstagedrc.mjs'), rootLintStaged());
          await writeFile(path.join(rootPath, 'commitlint.config.mjs'), rootCommitlint());
          await mkdir(path.join(rootPath, '.husky'), { recursive: true });
          for (const [hook, content] of Object.entries(rootHusky())) {
            const file = path.join(rootPath, '.husky', hook);
            await writeFile(file, content);
            await chmod(file, 0o755);
          }
        }
        await writeFile(
          path.join(rootPath, '.next-maker.json'),
          `${JSON.stringify(
            {
              workspace: true,
              apps,
              starter: scaffold.manifest.starter,
              answers: scaffold.answers,
              docker: !!options.docker,
              catalog: options.catalog !== false,
            },
            null,
            2,
          )}\n`,
        );
      },
      active,
    );

    if (options.install !== false) {
      await withStepSpinner(
        'Installing dependencies with pnpm...',
        'Dependencies installed.',
        () => installDependencies(rootPath, 'pnpm'),
        active,
      );
      await withStepSpinner(
        'Formatting...',
        'Formatted.',
        () => runScript(rootPath, 'pnpm', 'lint:fix'),
        active,
      );
    }
    for (const app of apps) {
      const example = path.join(rootPath, 'apps', app, '.env.example');
      if (fileExists(example)) await cp(example, path.join(rootPath, 'apps', app, '.env'));
    }
    if (options.git !== false) {
      await withStepSpinner(
        'Initializing git...',
        'Git initialized.',
        () => initializeGit(rootPath),
        active,
      );
    }

    deregister();
    log('');
    log(pc.green(`✨ Workspace ${name} is ready with ${apps.map((a) => `apps/${a}`).join(', ')}.`));
    log('');
    log('Next:');
    log(pc.cyan(`  cd ${name}`));
    if (options.install === false) log(pc.cyan('  pnpm install'));
    log(pc.cyan(`  pnpm --filter ${apps[0]} dev`));
    log('');
  } catch (err) {
    deregister();
    active.current?.fail('Failed to create workspace.');
    active.current = null;
    await cleanup();
    throw err;
  }
};
