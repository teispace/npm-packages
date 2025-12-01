import path from 'node:path';
import { updateJson } from '../../core/files';
import { ProjectPrompts } from '../../prompts/create-app.prompt';
import { startSpinner } from '../../config/spinner';

export class ConfigService {
  async configurePackageJson(projectPath: string, answers: ProjectPrompts): Promise<void> {
    const spinner = startSpinner('Configuring package.json...');
    try {
      await updateJson(path.join(projectPath, 'package.json'), (pkg) => {
        pkg.name = answers.projectName;
        pkg.version = answers.version;
        pkg.description = answers.description;
        pkg.author = answers.author;

        // Remove packageManager field to avoid "configured to use yarn" errors
        delete pkg.packageManager;

        if (answers.gitHomepage) pkg.homepage = answers.gitHomepage;
        if (answers.gitIssues) pkg.bugs = { url: answers.gitIssues };
        if (answers.gitRemote) pkg.repository = { type: 'git', url: answers.gitRemote };

        // Remove dependencies based on choices
        if (!answers.redux) {
          delete pkg.dependencies['@reduxjs/toolkit'];
          delete pkg.dependencies['react-redux'];
          delete pkg.dependencies['redux-persist'];
        }

        // Handle react-secure-storage
        const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;
        if (!keepSecureStorage) {
          delete pkg.dependencies['react-secure-storage'];
        }
        if (!answers.i18n) {
          delete pkg.dependencies['next-intl'];
        }
        if (!answers.darkMode) {
          delete pkg.dependencies['next-themes'];
        }
        if (answers.httpClient === 'none') {
          delete pkg.dependencies['axios'];
        } else if (answers.httpClient === 'fetch') {
          delete pkg.dependencies['axios'];
        }

        return pkg;
      });
      spinner.succeed('package.json configured.');
    } catch (error) {
      spinner.fail('Failed to configure package.json.');
      throw error;
    }
  }
}
