import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface LocalePromptResult {
  code: string;
  name: string;
  country: string;
  flag: string;
  copyTranslations: boolean;
}

export interface LocalePromptPresets {
  /** When set, the copy-translations prompt is skipped and this value is used. */
  copyTranslations?: boolean;
  name?: string;
  country?: string;
  flag?: string;
}

export const promptForLocaleDetails = async (
  code?: string,
  presets: LocalePromptPresets = {},
): Promise<LocalePromptResult> => {
  const questions: any[] = [];

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

  if (!presets.name) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Language name (e.g., Spanish, French):',
      validate: (value: string) => (value ? true : 'Language name is required'),
    });
  }
  if (!presets.country) {
    questions.push({
      type: 'input',
      name: 'country',
      message: 'Country (e.g., Spain, France):',
      validate: (value: string) => (value ? true : 'Country is required'),
    });
  }
  if (!presets.flag) {
    questions.push({
      type: 'input',
      name: 'flag',
      message: 'Flag emoji (e.g., 🇪🇸, 🇫🇷):',
      validate: (value: string) => (value ? true : 'Flag emoji is required'),
    });
  }

  if (presets.copyTranslations === undefined) {
    questions.push({
      type: 'confirm',
      name: 'copyTranslations',
      message: 'Copy translations from English? (No = empty values)',
      initial: false,
    });
  }

  const answers =
    questions.length > 0
      ? ((await prompt(questions)) as unknown as Partial<LocalePromptResult>)
      : {};

  return {
    code: code ?? (answers.code as string),
    name: presets.name ?? (answers.name as string),
    country: presets.country ?? (answers.country as string),
    flag: presets.flag ?? (answers.flag as string),
    copyTranslations: presets.copyTranslations ?? answers.copyTranslations ?? false,
  };
};
