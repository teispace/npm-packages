import Enquirer from 'enquirer';
import type { StateStore } from '../generators/types';

const { prompt } = Enquirer;

export interface FeatureOptions {
  featureName: string;
  createApi: boolean;
  createStore: boolean;
  persistStore: boolean;
}

export interface FeaturePromptPresets {
  api?: boolean;
  store?: boolean;
  persist?: boolean;
}

export const promptForFeatureDetails = async (
  featureName: string | undefined,
  state: StateStore,
  presets: FeaturePromptPresets = {},
): Promise<FeatureOptions> => {
  const questions: any[] = [];

  if (!featureName) {
    questions.push({
      type: 'input',
      name: 'featureName',
      message: 'Feature name (kebab-case):',
      initial: 'my-feature',
      validate: (value: string) =>
        /^[a-z][a-z0-9-]*$/.test(value) || 'Use lowercase letters, digits, and hyphens only.',
    });
  }

  if (presets.api === undefined) {
    questions.push({
      type: 'confirm',
      name: 'createApi',
      message: 'Generate the api/ layer (schema, DAL, Server Actions, queries)?',
      initial: true,
    });
  }

  if (state !== 'none' && presets.store === undefined) {
    questions.push({
      type: 'confirm',
      name: 'createStore',
      message: `Generate a ${state === 'zustand' ? 'Zustand' : 'Redux'} slice for client-only state?`,
      initial: false,
    });
    if (state === 'redux' && presets.persist === undefined) {
      questions.push({
        type: 'confirm',
        name: 'persistStore',
        message: 'Persist the slice across reloads?',
        initial: false,
        skip() {
          return !(this as any).state.answers.createStore;
        },
      });
    }
  }

  const answers =
    questions.length > 0 ? ((await prompt(questions)) as Partial<FeatureOptions>) : {};

  return {
    featureName: featureName ?? (answers.featureName as string),
    createApi: presets.api ?? answers.createApi ?? true,
    createStore: state !== 'none' && (presets.store ?? answers.createStore ?? false),
    persistStore: state === 'redux' && (presets.persist ?? answers.persistStore ?? false),
  };
};
