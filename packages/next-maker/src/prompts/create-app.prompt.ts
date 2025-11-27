import Enquirer from 'enquirer';
const { prompt } = Enquirer;

export const promptForProjectName = async (): Promise<string> => {
  const response = await prompt<{ projectName: string }>({
    type: 'input',
    name: 'projectName',
    message: 'What is the project name?',
    initial: 'my-app',
  });

  return response.projectName;
};

export const promptForPackageManager = async (): Promise<string> => {
  const response = await prompt<{ packageManager: string }>({
    type: 'select',
    name: 'packageManager',
    message: 'Which package manager would you like to use?',
    choices: ['yarn', 'npm', 'pnpm', 'bun'],
    initial: 0,
  });
  return response.packageManager;
};
