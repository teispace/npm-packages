import { Command, InvalidArgumentError } from 'commander';
import { log } from '../config';
import { promptForFeatureName } from '../prompts/feature.prompt';

interface FeatureOptions {
  tests: boolean;
  stories: boolean;
  css: boolean;
  path: string;
  template: 'basic' | 'advanced' | 'minimal';
  author?: string;
}

interface CreateFeatureParams {
  name?: string;
  options?: FeatureOptions;
}

export const registerFeatureCommand = (program: Command) => {
  program
    .command('feature [name]')
    .description('Generate a new feature module')
    .option('--tests', 'Include test files', true)
    .option('--stories', 'Include Storybook stories', false)
    .option('--css', 'Include CSS module', true)
    .option('-p, --path <path>', 'Custom path for feature', 'src/features')
    .option(
      '-t, --template <template>',
      'Template to use (basic|advanced|minimal)',
      (value) => {
        const valid = ['basic', 'advanced', 'minimal'];
        if (!valid.includes(value)) {
          throw new InvalidArgumentError(`Template must be one of: ${valid.join(', ')}`);
        }
        return value;
      },
      'basic',
    )
    .option('--author <name>', 'Author name for file headers')
    .action(async (name, options) => {
      await createFeature({ name, options });
    });
};

const createFeature = async (params: CreateFeatureParams): Promise<void> => {
  log('🎨 Creating a new feature...');

  // Prompt for feature name if not provided
  if (!params.name) {
    params.name = await promptForFeatureName();
  }

  // Log the received values
  log(`Feature name is ${params.name}`);
  log(`Options: ${JSON.stringify(params.options)}`);
};
