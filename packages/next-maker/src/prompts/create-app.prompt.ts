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
    },
    {
      type: 'input',
      name: 'email',
      message: 'Support email:',
      initial: 'support@example.com',
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
      initial: 0,
    },
    {
      type: 'input',
      name: 'gitRemote',
      message: 'Git remote origin URL (optional):',
    },
    {
      type: 'input',
      name: 'gitIssues',
      message: 'Git issues URL (optional):',
    },
    {
      type: 'input',
      name: 'gitHomepage',
      message: 'Project homepage URL (optional):',
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
