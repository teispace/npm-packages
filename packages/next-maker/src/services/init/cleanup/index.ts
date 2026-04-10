import { startSpinner } from '../../../config/spinner';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';
import { cleanupDarkMode } from './dark-mode.cleanup';
import { cleanupHttpClient } from './http.cleanup';
import { cleanupI18n } from './i18n.cleanup';
import {
  cleanupChangelog,
  cleanupConfig,
  cleanupLicense,
  cleanupSecureStorage,
  cleanupTemplateArtifacts,
} from './misc.cleanup';
import { cleanupRedux } from './redux.cleanup';

export const cleanupFeatures = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const spinner = startSpinner('Customizing features...');
  try {
    await cleanupHttpClient(projectPath, answers);
    await cleanupSecureStorage(projectPath, answers);
    await cleanupRedux(projectPath, answers);
    await cleanupDarkMode(projectPath, answers);
    await cleanupI18n(projectPath, answers);
    await cleanupLicense(projectPath);
    await cleanupChangelog(projectPath);
    await cleanupConfig(projectPath);
    await cleanupTemplateArtifacts(projectPath);
    spinner.succeed('Features customized.');
  } catch (error) {
    spinner.fail('Failed to customize features.');
    throw error;
  }
};
