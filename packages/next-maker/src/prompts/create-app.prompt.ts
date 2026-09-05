import Enquirer from 'enquirer';
import type { Answers, OptionValue, StarterManifest } from '../composition/manifest';
import { satisfies } from '../composition/manifest';
import type { PackageManager } from '../core/package-manager';

const { prompt } = Enquirer;

const PROJECT_NAME_RE = /^[a-z0-9-_]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export const isValidProjectName = (value: string): boolean => PROJECT_NAME_RE.test(value);
const isValidSemver = (value: string): boolean => SEMVER_RE.test(value);

/** Everything about the project that is not a starter option. */
export interface ProjectIdentity {
  projectName: string;
  description: string;
  author: string;
  version: string;
  email: string;
  gitRemote: string;
  pushToRemote: boolean;
  gitIssues: string;
  gitHomepage: string;
  readme: boolean;
  copyEnv: boolean;
}

export interface ProjectPrompts extends ProjectIdentity {
  packageManager: PackageManager;
  options: Answers;
}

export const assertValidProjectName = (name: string): void => {
  if (!isValidProjectName(name)) {
    throw new Error(
      `Invalid project name "${name}". Use lowercase letters, digits, hyphens, and underscores only — no slashes, "..", or absolute paths.`,
    );
  }
};

export const defaultIdentity = (
  initialName: string | undefined,
  overrides: Partial<ProjectIdentity> = {},
): ProjectIdentity => {
  const projectName = overrides.projectName ?? initialName ?? 'my-app';
  assertValidProjectName(projectName);
  const version = overrides.version ?? '0.1.0';
  if (!isValidSemver(version)) {
    throw new Error(`Invalid version "${version}". Expected semver (e.g. 0.1.0).`);
  }
  return {
    projectName,
    description: overrides.description ?? 'A Next.js application',
    author: overrides.author ?? 'Teispace',
    version,
    email: overrides.email ?? 'support@example.com',
    gitRemote: overrides.gitRemote ?? '',
    pushToRemote: overrides.pushToRemote ?? false,
    gitIssues: overrides.gitIssues ?? '',
    gitHomepage: overrides.gitHomepage ?? '',
    readme: overrides.readme ?? true,
    copyEnv: overrides.copyEnv ?? true,
  };
};

type PromptContext = {
  state?: { answers?: Record<string, unknown> };
  enquirer?: { answers?: Record<string, unknown> };
};
const answersOf = (ctx: PromptContext): Record<string, unknown> =>
  ctx.state?.answers ?? ctx.enquirer?.answers ?? {};

export const promptForIdentity = async (initialName?: string): Promise<ProjectIdentity> => {
  if (initialName !== undefined) assertValidProjectName(initialName);

  const response = await prompt<ProjectIdentity>([
    {
      type: 'input',
      name: 'projectName',
      message: 'What is the project name?',
      initial: initialName || 'my-app',
      skip: !!initialName,
      validate: (value: string) =>
        isValidProjectName(value) ||
        'Project name must be lowercase and contain only alphanumeric characters, hyphens, and underscores.',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      initial: 'A Next.js application',
    },
    { type: 'input', name: 'author', message: 'Author:', initial: 'Teispace' },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      initial: '0.1.0',
      validate: (value: string) =>
        isValidSemver(value) || 'Version must be a valid semantic version (x.y.z).',
    },
    { type: 'input', name: 'email', message: 'Support email:', initial: 'support@example.com' },
    {
      type: 'input',
      name: 'gitRemote',
      message: 'GitHub repository URL (optional):',
      initial: '',
      validate: (value: string) =>
        !value ||
        /^(https:\/\/github\.com\/[\w-]+\/[\w.-]+(\.git)?|git@github\.com:[\w-]+\/[\w.-]+\.git)$/.test(
          value,
        ) ||
        'Enter a GitHub URL (https://github.com/user/repo or git@github.com:user/repo.git).',
    },
    {
      type: 'confirm',
      name: 'pushToRemote',
      message: 'Push the initial commit to the remote?',
      initial: false,
      skip: function (this: PromptContext) {
        return !answersOf(this).gitRemote;
      },
    },
    { type: 'confirm', name: 'readme', message: 'Create a README.md?', initial: true },
    { type: 'confirm', name: 'copyEnv', message: 'Copy .env.example to .env?', initial: true },
  ] as any);

  return defaultIdentity(initialName, {
    ...response,
    projectName: initialName ?? response.projectName,
  });
};

/**
 * Ask the starter's own questions. The manifest declares each option's
 * type, label, values, default, and `requires`; nothing here knows what a
 * feature is. Options whose requirements are not met are skipped and later
 * forced to their off value by `resolveAnswers`.
 */
export const promptForOptions = async (
  manifest: StarterManifest,
  preset: Answers = {},
): Promise<Answers> => {
  const questions = Object.entries(manifest.options).map(([name, spec]) => {
    const initial = preset[name] ?? spec.default;
    const base = {
      name,
      message: spec.label ?? name,
      skip: function (this: PromptContext) {
        if (!spec.requires) return false;
        const current = answersOf(this);
        return !Object.entries(spec.requires).every(([dep, accepted]) =>
          satisfies(manifest.options[dep], current[dep] as OptionValue | undefined, accepted),
        );
      },
    };
    if (spec.type === 'boolean') return { ...base, type: 'confirm', initial: Boolean(initial) };
    if (spec.type === 'multi') {
      return {
        ...base,
        type: 'multiselect',
        choices: (spec.values ?? []).map((v) => ({ name: v, value: v })),
        initial: Array.isArray(initial) ? initial : [],
      };
    }
    const values = spec.values ?? [];
    return {
      ...base,
      type: 'select',
      choices: values,
      initial: Math.max(0, values.indexOf(String(initial))),
    };
  });

  const response = (await prompt(questions as any)) as Record<string, unknown>;
  const answers: Answers = {};
  for (const [name, spec] of Object.entries(manifest.options)) {
    const value = response[name];
    if (value === undefined) continue;
    answers[name] = spec.type === 'multi' && !Array.isArray(value) ? [] : (value as OptionValue);
  }
  return answers;
};
