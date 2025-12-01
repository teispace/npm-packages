import degit from 'degit';
import { startSpinner } from '../../config/spinner';

export const cloneTemplate = async (projectPath: string): Promise<void> => {
  const spinner = startSpinner('Downloading template...');
  try {
    const emitter = degit('teispace/nextjs-starter', {
      cache: false,
      force: true,
      verbose: true,
    });
    await emitter.clone(projectPath);
    spinner.succeed('Template downloaded successfully.');
  } catch (error) {
    spinner.fail('Failed to download template.');
    throw error;
  }
};
