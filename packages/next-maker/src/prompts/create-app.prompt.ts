import Enquirer from 'enquirer';
import { PackageManager } from '../core/package-manager';

const { prompt } = Enquirer;

type PromptContext = {
  state?: { answers?: Partial<ProjectPrompts> };
  enquirer?: { answers?: Partial<ProjectPrompts> };
};

export interface ProjectPrompts {
  projectName: string;
  description: string;
  author: string;
  version: string;
  packageManager: PackageManager;
  gitRemote: string;
  gitIssues: string;
  gitHomepage: string;
  httpClient: 'axios' | 'fetch' | 'both' | 'none';
  reactSecureStorage?: boolean;
  email: string;
  company: string;
  keepTemplates: boolean;
  darkMode: boolean;
  redux: boolean;
  i18n: boolean;
  communityFiles: string[];
  readme: boolean;
  docker: boolean;
  containerName?: string;
  imageName?: string;
  imageTag?: string;
  ci: boolean;
  preCommitHooks: boolean;
  commitizen: boolean;
}

export const promptForProjectDetails = async (initialName?: string): Promise<ProjectPrompts> => {
  const response = await prompt<ProjectPrompts>([
    {
      type: 'input',
      name: 'projectName',
      message: 'What is the project name?',
      initial: initialName || 'my-app',
      skip: !!initialName,
      validate: (value: string) => {
        if (!/^[a-z0-9-_]+$/.test(value)) {
          return 'Project name must be lowercase and contain only alphanumeric characters, hyphens, and underscores.';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      initial: 'A Next.js application',
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author:',
      initial: 'Teispace',
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      initial: '0.1.0',
      validate: (value: string) => {
        if (!/^\d+\.\d+\.\d+$/.test(value)) {
          return 'Version must be a valid semantic version (x.y.z).';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'email',
      message: 'Support email:',
      initial: 'support@example.com',
      validate: (value: string) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Please enter a valid email address.';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'company',
      message: 'Company name:',
      initial: 'Teispace',
    },
    {
      type: 'select',
      name: 'packageManager',
      message: 'Which package manager would you like to use?',
      choices: ['npm', 'yarn', 'pnpm', 'bun'],
      initial: 1,
    },
    {
      type: 'input',
      name: 'gitRemote',
      message: 'Git remote origin URL (optional):',
      validate: (value: string) => {
        if (value && !/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value)) {
          return 'Please enter a valid URL.';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'gitIssues',
      message: 'Git issues URL (optional):',
      validate: (value: string) => {
        if (value && !/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value)) {
          return 'Please enter a valid URL.';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'gitHomepage',
      message: 'Project homepage URL (optional):',
      validate: (value: string) => {
        if (value && !/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value)) {
          return 'Please enter a valid URL.';
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'keepTemplates',
      message: 'Do you want to keep GitHub issue and pull request templates?',
      initial: true,
    },
    {
      type: 'select',
      name: 'httpClient',
      message: 'Which HTTP client do you want to use?',
      choices: ['axios', 'fetch', 'both', 'none'],
      initial: 0,
    },
    {
      type: 'confirm',
      name: 'reactSecureStorage',
      message: 'Do you want to include react-secure-storage?',
      initial: true,
      skip: function (this: PromptContext) {
        // Access answers from the prompt instance safely across versions
        const answers = this.state?.answers ?? this.enquirer?.answers ?? {};
        // If HTTP client is selected (not 'none'), we skip this question (it will be auto-included)
        return !!(answers.httpClient && answers.httpClient !== 'none');
      },
    },
    {
      type: 'confirm',
      name: 'darkMode',
      message: 'Do you want to include Dark Mode (Tailwind + next-themes)?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'redux',
      message: 'Do you want to include Redux Toolkit?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'i18n',
      message: 'Do you want to include Internationalization (next-intl)?',
      initial: true,
    },
    {
      type: 'multiselect',
      name: 'communityFiles',
      message: 'Select community files to include:',
      choices: [
        { name: 'CODE_OF_CONDUCT.md', value: 'CODE_OF_CONDUCT.md' },
        { name: 'CONTRIBUTING.md', value: 'CONTRIBUTING.md' },
        { name: 'SECURITY.md', value: 'SECURITY.md' },
      ],
      initial: ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md'],
    },
    {
      type: 'confirm',
      name: 'readme',
      message: 'Do you want to create a README.md?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'docker',
      message: 'Do you want to include Docker configuration?',
      initial: true,
    },
    {
      type: 'input',
      name: 'containerName',
      message: 'Docker Container Name:',
      initial: 'next-app',
      skip: function (this: PromptContext) {
        const answers = this.state?.answers ?? this.enquirer?.answers ?? {};
        return !answers.docker;
      },
      validate: (value: string) => {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) {
          return 'Invalid Docker container name.';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'imageName',
      message: 'Docker Image Name:',
      initial: 'nextjs-starter',
      skip: function (this: PromptContext) {
        const answers = this.state?.answers ?? this.enquirer?.answers ?? {};
        return !answers.docker;
      },
      validate: (value: string) => {
        if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)) {
          return 'Invalid Docker image name (must be lowercase).';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'imageTag',
      message: 'Docker Image Tag:',
      initial: 'latest',
      skip: function (this: PromptContext) {
        const answers = this.state?.answers ?? this.enquirer?.answers ?? {};
        return !answers.docker;
      },
      validate: (value: string) => {
        if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(value)) {
          return 'Invalid Docker image tag.';
        }
        return true;
      },
    },
    {
      type: 'confirm',
      name: 'ci',
      message: 'Do you want to include GitHub Actions (CI/CD)?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'preCommitHooks',
      message: 'Do you want to setup pre-commit hooks (Husky, Commitlint, Lint-staged)?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'commitizen',
      message: 'Do you want to setup Commitizen?',
      initial: true,
    },
  ] as any);

  return response;
};
