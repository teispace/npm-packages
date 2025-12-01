import { Command } from 'commander';
import path from 'node:path';
import pc from 'picocolors';
import { startSpinner } from '../config/spinner';
import { promptForProjectDetails } from '../prompts/create-app.prompt';
import { deleteDirectory, fileExists } from '../core/files';
import { initializeGit, addRemote } from '../core/git';
import { installDependencies, runScript } from '../core/package-manager';
import { log, printBanner } from '../config';
import { TemplateService } from '../services/init/template.service';
import { ConfigService } from '../services/init/config.service';
import { CleanupService } from '../services/init/cleanup.service';
import { ProvidersService } from '../services/init/providers.service';
import { DevToolsService } from '../services/init/devtools.service';

export const registerAppCommand = (program: Command) => {
  program
    .command('init')
    .description('Initialize a new Next.js project')
    .argument('[name]', 'Project name')
    .action(async (name) => {
      await createApp(name);
    });
};

const createApp = async (initialName?: string): Promise<void> => {
  printBanner();
  log('Welcome to the Teispace Next.js App Creator!');
  log('');

  const answers = await promptForProjectDetails(initialName);
  const projectPath = path.resolve(process.cwd(), answers.projectName);

  if (fileExists(projectPath)) {
    console.error(pc.red(`Error: Directory ${answers.projectName} already exists.`));
    process.exit(1);
  }

  const spinner = startSpinner('Initializing project...');

  // Initialize Services
  const templateService = new TemplateService();
  const configService = new ConfigService();
  const cleanupService = new CleanupService();
  const providersService = new ProvidersService();
  const devToolsService = new DevToolsService();

  try {
    // 1. Clone template
    await templateService.cloneTemplate(projectPath);

    // 2. Update package.json
    await configService.configurePackageJson(projectPath, answers);

    // 3. Customize Features (Cleanup)
    await cleanupService.cleanupFeatures(projectPath, answers);

    // 4. Generate Code (Providers, Layout)
    spinner.text = 'Generating code...';
    await providersService.generateRootProvider(projectPath, answers);
    await providersService.generateLayout(projectPath, answers);

    // 5. Setup DevTools & Community Files
    spinner.text = 'Setting up developer tools...';
    await devToolsService.setupDevTools(projectPath, answers);

    // 6. Initialize Git
    spinner.text = 'Initializing Git...';
    await initializeGit(projectPath);
    if (answers.gitRemote) {
      await addRemote(projectPath, answers.gitRemote);
    }

    // 7. Install Dependencies
    spinner.text = 'Installing dependencies...';
    await installDependencies(projectPath, answers.packageManager);

    // 8. Format and Lint
    spinner.text = 'Formatting and Linting...';
    await runScript(projectPath, answers.packageManager, 'format');
    await runScript(projectPath, answers.packageManager, 'lint:fix');

    spinner.succeed(pc.green(`Project ${answers.projectName} created successfully!`));
    log('');
    log('To get started:');
    log(pc.cyan(`  cd ${answers.projectName}`));
    log(
      pc.cyan(
        `  ${answers.packageManager === 'npm' ? 'npm run dev' : answers.packageManager + ' dev'}`,
      ),
    );
    log('');
  } catch (err) {
    spinner.fail('Failed to create project.');
    console.error(err);
    // Cleanup: Delete the created directory if it exists
    if (fileExists(projectPath)) {
      spinner.text = 'Cleaning up...';
      try {
        await deleteDirectory(projectPath);
        console.log(pc.yellow(`\nCleaned up: Deleted directory ${answers.projectName}`));
      } catch (cleanupErr) {
        console.error(pc.red(`\nFailed to clean up directory ${answers.projectName}:`), cleanupErr);
      }
    }
    process.exit(1);
  }
};
