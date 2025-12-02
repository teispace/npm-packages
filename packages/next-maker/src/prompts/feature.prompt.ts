import Enquirer from 'enquirer';
const { prompt } = Enquirer;

export interface FeatureOptions {
  featureName: string;
  hasRedux: boolean;
  createStore: boolean;
  persistStore: boolean;
  httpClient: 'axios' | 'fetch' | 'both' | 'none';
  createService: boolean;
  selectedHttpClient?: 'axios' | 'fetch';
}

export const promptForFeatureDetails = async (
  featureName?: string,
  hasRedux?: boolean,
  httpClient?: 'axios' | 'fetch' | 'both' | 'none',
  skipStore?: boolean,
  storeOption?: 'persist' | 'no-persist',
  skipService?: boolean,
  serviceClient?: 'axios' | 'fetch',
): Promise<FeatureOptions> => {
  const questions: any[] = [];

  // Feature name
  if (!featureName) {
    questions.push({
      type: 'input',
      name: 'featureName',
      message: 'What is the feature name?',
      initial: 'my-feature',
      validate: (value: string) => {
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Feature name must be lowercase and contain only alphanumeric characters and hyphens.';
        }
        return true;
      },
    });
  }

  // Redux store questions
  if (hasRedux && skipStore === undefined) {
    questions.push({
      type: 'confirm',
      name: 'createStore',
      message: 'Generate Redux store for this feature?',
      initial: true,
    });

    questions.push({
      type: 'confirm',
      name: 'persistStore',
      message: 'Enable persistence for this store?',
      initial: false,
      skip() {
        // Skip if createStore is false

        return !(this as any).state.answers.createStore;
      },
    });
  }

  // HTTP service questions
  if (httpClient && httpClient !== 'none' && skipService === undefined) {
    questions.push({
      type: 'confirm',
      name: 'createService',
      message: 'Generate API service for this feature?',
      initial: true,
    });

    if (httpClient === 'both' && !serviceClient) {
      questions.push({
        type: 'select',
        name: 'selectedHttpClient',
        message: 'Which HTTP client to use for the service?',
        choices: ['fetch', 'axios'],
        initial: 0,
        skip() {
          // Skip if createService is false

          return !(this as any).state.answers.createService;
        },
      });
    }
  }

  const answers: any = questions.length > 0 ? await prompt(questions) : {};

  return {
    featureName: featureName || (answers.featureName as string),
    hasRedux: hasRedux || false,
    createStore:
      skipStore === true
        ? false
        : storeOption !== undefined
          ? true
          : (answers.createStore as boolean) || false,
    persistStore:
      storeOption === 'persist'
        ? true
        : storeOption === 'no-persist'
          ? false
          : (answers.persistStore as boolean) || false,
    httpClient: httpClient || 'none',
    createService: skipService === true ? false : (answers.createService as boolean) || false,
    selectedHttpClient:
      serviceClient ||
      (answers.selectedHttpClient as 'axios' | 'fetch' | undefined) ||
      (httpClient === 'both' ? 'fetch' : httpClient !== 'none' ? httpClient : undefined),
  };
};
