import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface LocalePromptResult {
  code: string;
  name: string;
  country: string;
  flag: string;
  copyTranslations: boolean;
}

export const promptForLocaleDetails = async (code?: string): Promise<LocalePromptResult> => {
  const questions = [];

  if (!code) {
    questions.push({
      type: 'input',
      name: 'code',
      message: 'Locale code (e.g., es, fr, de):',
      validate: (value: string) => {
        if (!value) return 'Locale code is required';
        if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) {
          return 'Use format: xx or xx-XX (e.g., es, pt-BR)';
        }
        return true;
      },
    });
  }

  questions.push(
    {
      type: 'input',
      name: 'name',
      message: 'Language name (e.g., Spanish, French):',
      validate: (value: string) => (value ? true : 'Language name is required'),
    },
    {
      type: 'input',
      name: 'country',
      message: 'Country (e.g., Spain, France):',
      validate: (value: string) => (value ? true : 'Country is required'),
    },
    {
      type: 'input',
      name: 'flag',
      message: 'Flag emoji (e.g., 🇪🇸, 🇫🇷):',
      validate: (value: string) => (value ? true : 'Flag emoji is required'),
    },
    {
      type: 'confirm',
      name: 'copyTranslations',
      message: 'Copy translations from English? (No = empty values)',
      initial: false,
    },
  );

  const answers = (await prompt(questions)) as unknown as LocalePromptResult;

  return {
    code: code || answers.code,
    name: answers.name,
    country: answers.country,
    flag: answers.flag,
    copyTranslations: answers.copyTranslations,
  };
};
