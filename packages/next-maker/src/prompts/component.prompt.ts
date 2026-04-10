import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface ComponentPromptResult {
  componentName: string;
  isClient: boolean;
}

export const promptForComponentDetails = async (name?: string): Promise<ComponentPromptResult> => {
  const questions = [];

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

  questions.push({
    type: 'confirm',
    name: 'isClient',
    message: "Add 'use client' directive?",
    initial: false,
  });

  const answers = (await prompt(questions)) as unknown as ComponentPromptResult;

  return {
    componentName: name || answers.componentName,
    isClient: answers.isClient,
  };
};
