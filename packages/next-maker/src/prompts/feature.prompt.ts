import Enquirer from 'enquirer';
const { prompt } = Enquirer;

export const promptForFeatureName = async (): Promise<string> => {
  const response = await prompt<{ featureName: string }>({
    type: 'input',
    name: 'featureName',
    message: 'What is the feature name?',
    initial: 'my-feature',
  });
  return response.featureName;
};
