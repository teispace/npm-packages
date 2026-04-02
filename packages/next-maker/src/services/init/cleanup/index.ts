import { startSpinner } from '../../../config/spinner';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';
import { cleanupHttpClient } from './http.cleanup';
import { cleanupRedux } from './redux.cleanup';
import { cleanupDarkMode } from './dark-mode.cleanup';
import { cleanupI18n } from './i18n.cleanup';
import {
  cleanupSecureStorage,
  cleanupLicense,
  cleanupChangelog,
  cleanupConfig,
  cleanupTemplateArtifacts,
} from './misc.cleanup';

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
