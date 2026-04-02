import Enquirer from 'enquirer';
const { prompt } = Enquirer;

export interface PagePromptResult {
  pageName: string;
  withLoading: boolean;
  withError: boolean;
}

export const promptForPageDetails = async (name?: string): Promise<PagePromptResult> => {
  const questions = [];

  if (!name) {
    questions.push({
      type: 'input',
      name: 'pageName',
      message: 'Page name (kebab-case):',
      validate: (value: string) => {
        if (!value) return 'Page name is required';
        if (!/^[a-z][a-z0-9-]*$/.test(value)) {
          return 'Use lowercase letters, numbers, and hyphens only';
        }
        return true;
      },
    });
  }

  questions.push(
    {
      type: 'confirm',
      name: 'withLoading',
      message: 'Generate loading.tsx?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'withError',
      message: 'Generate error.tsx?',
      initial: true,
    },
  );

  const answers = (await prompt(questions)) as unknown as PagePromptResult;

  return {
    pageName: name || answers.pageName,
    withLoading: answers.withLoading,
    withError: answers.withError,
  };
};
