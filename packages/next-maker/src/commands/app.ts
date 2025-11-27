import { Command } from 'commander';
import { log, printBanner, printHeader } from '../config';
import { promptForProjectName, promptForPackageManager } from '../prompts/create-app.prompt';

interface AppOptions {
  packageManager: 'npm' | 'yarn' | 'pnpm';
}

interface CreateAppParams {
  name?: string;
  options?: AppOptions;
}

export const registerAppCommand = (program: Command) => {
  program
    .argument('[name]', 'Project name')
    .option('--package-manager <packageManager>', 'Package manager to use (npm|yarn|pnpm)', 'npm')
    .action(async (name, options) => {
      await createApp({ name, options });
    });
};

const createApp = async (params: CreateAppParams): Promise<void> => {
  printBanner();

  log('Welcome to the Teispace Next.js App Creator!');
  log('');
  log('This tool will help you create a new Next.js application');
  log('with best practices and modern tooling.');
  log('');

  printHeader('📦 Project Setup');

  // Prompt for project name if not provided
  if (!params.name) {
    params.name = await promptForProjectName();
  }

  // Prompt for package manager
  const packageManager = await promptForPackageManager();

  log('');
  log(`Creating a new Next.js app in folder: ${params.name}`);
  log(`Using package manager: ${packageManager}`);
  log(`Options: ${JSON.stringify(params.options)}`);
  log('');
};
