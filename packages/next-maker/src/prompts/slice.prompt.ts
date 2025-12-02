import Enquirer from 'enquirer';
const { prompt } = Enquirer;

export interface SliceOptions {
  sliceName: string;
  persistSlice: boolean;
}

export const promptForSliceDetails = async (
  sliceName?: string,
  persist?: boolean,
  noPersist?: boolean,
): Promise<SliceOptions> => {
  const questions: any[] = [];

  // Slice name
  if (!sliceName) {
    questions.push({
      type: 'input',
      name: 'sliceName',
      message: 'What is the slice name?',
      initial: 'my-slice',
      validate: (value: string) => {
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Slice name must be lowercase and contain only alphanumeric characters and hyphens.';
        }
        return true;
      },
    });
  }

  // Persistence question
  if (persist === undefined && noPersist === undefined) {
    questions.push({
      type: 'confirm',
      name: 'persistSlice',
      message: 'Enable persistence for this slice?',
      initial: false,
    });
  }

  const answers: any = questions.length > 0 ? await prompt(questions) : {};

  return {
    sliceName: sliceName || (answers.sliceName as string),
    persistSlice:
      persist === true
        ? true
        : noPersist === false
          ? false
          : (answers.persistSlice as boolean) || false,
  };
};
