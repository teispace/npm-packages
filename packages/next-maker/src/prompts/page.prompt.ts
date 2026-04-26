import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface PagePromptResult {
  pageName: string;
  withLoading: boolean;
  withError: boolean;
}

export interface PagePromptPresets {
  /** When set, the loading prompt is skipped and this value is used. */
  loading?: boolean;
  /** When set, the error prompt is skipped and this value is used. */
  error?: boolean;
}

export const promptForPageDetails = async (
  name?: string,
  presets: PagePromptPresets = {},
): Promise<PagePromptResult> => {
  const questions: any[] = [];

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

  if (presets.loading === undefined) {
    questions.push({
      type: 'confirm',
      name: 'withLoading',
      message: 'Generate loading.tsx?',
      initial: true,
    });
  }

  if (presets.error === undefined) {
    questions.push({
      type: 'confirm',
      name: 'withError',
      message: 'Generate error.tsx?',
      initial: true,
    });
  }

  const answers =
    questions.length > 0 ? ((await prompt(questions)) as unknown as Partial<PagePromptResult>) : {};

  return {
    pageName: name ?? (answers.pageName as string),
    withLoading: presets.loading ?? answers.withLoading ?? true,
    withError: presets.error ?? answers.withError ?? true,
  };
};
