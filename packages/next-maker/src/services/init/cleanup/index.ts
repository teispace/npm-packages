import { startSpinner } from '../../../config/spinner';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';
import { writeTestUtils } from '../../common/test-utils';
import { cleanupBundleAnalyzer } from './bundle-analyzer.cleanup';
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
import { cleanupReactCompiler } from './react-compiler.cleanup';
import { cleanupRedux } from './redux.cleanup';
import { cleanupTests } from './tests.cleanup';

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
    // next.config.ts modifiers: run bundle-analyzer first (unwraps the outer
    // call), then i18n (unwraps withNextIntl), then react-compiler.
    await cleanupBundleAnalyzer(projectPath, answers);
    await cleanupI18n(projectPath, answers);
    await cleanupReactCompiler(projectPath, answers);
    await cleanupTests(projectPath, answers);
    await cleanupLicense(projectPath);
    await cleanupChangelog(projectPath);
    await cleanupConfig(projectPath);
    await cleanupTemplateArtifacts(projectPath);
    // Rebuild test-utils only if tests are kept. redux/i18n cleanups delete
    // the template version whenever their feature is dropped, so the file
    // shape may not match the final feature set — regenerate from scratch.
    if (answers.tests) {
      await writeTestUtils(projectPath, { redux: answers.redux, i18n: answers.i18n });
    }
    spinner.succeed('Features customized.');
  } catch (error) {
    spinner.fail('Failed to customize features.');
    throw error;
  }
};
