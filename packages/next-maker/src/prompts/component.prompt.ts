import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface ComponentPromptResult {
  componentName: string;
  isClient: boolean;
}

export interface ComponentPromptPresets {
  /** When set, the `'use client'` prompt is skipped and this value is used. */
  client?: boolean;
}

export const promptForComponentDetails = async (
  name?: string,
  presets: ComponentPromptPresets = {},
): Promise<ComponentPromptResult> => {
  const questions: any[] = [];

  if (!name) {
    questions.push({
      type: 'input',
      name: 'componentName',
      message: 'Component name (kebab-case):',
      validate: (value: string) => {
        if (!value) return 'Component name is required';
        if (!/^[a-z][a-z0-9-]*$/.test(value)) {
          return 'Use lowercase letters, numbers, and hyphens only';
        }
        return true;
      },
    });
  }

  if (presets.client === undefined) {
    questions.push({
      type: 'confirm',
      name: 'isClient',
      message: "Add 'use client' directive?",
      initial: false,
    });
  }

  const answers =
    questions.length > 0
      ? ((await prompt(questions)) as unknown as Partial<ComponentPromptResult>)
      : {};

  return {
    componentName: name ?? (answers.componentName as string),
    isClient: presets.client ?? answers.isClient ?? false,
  };
};
