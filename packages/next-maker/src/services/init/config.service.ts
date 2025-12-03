import path from 'node:path';
import { updateJson } from '../../core/files';
import { ProjectPrompts } from '../../prompts/create-app.prompt';
import { startSpinner } from '../../config/spinner';
import { PROJECT_PATHS } from '../../config/paths';
import { PACKAGES } from '../../config/packages';

export const configurePackageJson = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const spinner = startSpinner('Configuring package.json...');
  try {
    // Generate URLs from GitHub repository URL if provided
    let gitRemote = answers.gitRemote;
    let gitHomepage = answers.gitHomepage;
    let gitIssues = answers.gitIssues;

    if (answers.gitRemote) {
      // Convert SSH to HTTPS if needed
      if (answers.gitRemote.startsWith('git@github.com:')) {
        gitRemote = answers.gitRemote
          .replace('git@github.com:', 'https://github.com/')
          .replace(/\.git$/, '');
      }

      // Generate homepage and issues URLs if not provided
      if (!gitHomepage) {
        gitHomepage = `${gitRemote.replace(/\.git$/, '')}#readme`;
      }
      if (!gitIssues) {
        gitIssues = `${gitRemote.replace(/\.git$/, '')}/issues`;
      }

      // Add .git suffix for repository URL if not present
      if (!gitRemote.endsWith('.git')) {
        gitRemote = `${gitRemote}.git`;
      }
    }

    await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
      pkg.name = answers.projectName;
      pkg.version = answers.version;
      pkg.description = answers.description;
      pkg.author = answers.author;

      // Remove packageManager field to avoid "configured to use yarn" errors
      // and let the user's environment handle it.
      delete pkg.packageManager;

      // Handle git-related fields based on whether GitHub URL was provided
      if (answers.gitRemote) {
        if (gitHomepage) pkg.homepage = gitHomepage;
        if (gitIssues) pkg.bugs = { url: gitIssues };
        if (gitRemote) pkg.repository = { type: 'git', url: gitRemote };
      } else {
        // If no GitHub URL provided, remove template's git-related fields
        delete pkg.homepage;
        delete pkg.bugs;
        delete pkg.repository;
      }

      // Remove dependencies based on choices
      if (!answers.redux) {
        delete pkg.dependencies[PACKAGES.REDUX_TOOLKIT];
        delete pkg.dependencies[PACKAGES.REACT_REDUX];
        delete pkg.dependencies[PACKAGES.REDUX_PERSIST];
      }

      // Handle react-secure-storage
      const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;
      if (!keepSecureStorage) {
        delete pkg.dependencies[PACKAGES.REACT_SECURE_STORAGE];
      }
      if (!answers.i18n) {
        delete pkg.dependencies[PACKAGES.NEXT_INTL];
      }
      if (!answers.darkMode) {
        delete pkg.dependencies[PACKAGES.NEXT_THEMES];
      }
      if (answers.httpClient === 'none') {
        delete pkg.dependencies[PACKAGES.AXIOS];
      } else if (answers.httpClient === 'fetch') {
        delete pkg.dependencies[PACKAGES.AXIOS];
      }

      return pkg;
    });
    spinner.succeed('package.json configured.');
  } catch (error) {
    spinner.fail('Failed to configure package.json.');
    throw error;
  }
};
