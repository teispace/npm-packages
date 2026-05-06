import Enquirer from 'enquirer';

const { prompt } = Enquirer;

export interface FaviconPromptResult {
  source: string;
}

export const promptForFaviconSource = async (
  presets: { source?: string } = {},
): Promise<FaviconPromptResult> => {
  if (presets.source) return { source: presets.source };

  const answer = (await prompt({
    type: 'input',
    name: 'source',
    message: 'Path to source image (PNG/JPG/SVG/WebP/AVIF):',
    validate: (value: string) => {
      if (!value) return 'Source path is required';
      return true;
    },
  })) as { source: string };

  return { source: answer.source };
};
