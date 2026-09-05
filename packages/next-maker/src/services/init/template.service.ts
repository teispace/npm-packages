import { startSpinner } from '../../config/spinner';
import { cloneStarter } from '../../config/starter';

export const cloneTemplate = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Downloading template...');
  try {
    await cloneStarter(projectPath, { verbose: true });
    spinner.succeed('Template downloaded successfully.');
  } catch (error) {
    spinner.fail('Failed to download template.');
    throw error;
  }
};
