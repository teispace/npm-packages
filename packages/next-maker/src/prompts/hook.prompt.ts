import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface HookPromptResult {
  hookName: string;
}

export const promptForHookDetails = async (name?: string): Promise<HookPromptResult> => {
  if (name) return { hookName: name };

  const answers = (await prompt({
    type: 'input',
    name: 'hookName',
    message: 'Hook name (kebab-case, without "use" prefix):',
    validate: (value: string) => {
      if (!value) return 'Hook name is required';
      if (!/^[a-z][a-z0-9-]*$/.test(value)) {
        return 'Use lowercase letters, numbers, and hyphens only';
      }
      return true;
    },
  })) as unknown as HookPromptResult;

  return answers;
};
