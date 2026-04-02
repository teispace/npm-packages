import type { PipelineContext, PipelineStep } from './types';

/**
 * Execute a sequence of pipeline steps with spinner feedback.
 * Each step gets the shared context and reports progress via the spinner.
 */
export const executePipeline = async <T extends PipelineContext>(
  steps: PipelineStep<T>[],
  context: T,
): Promise<void> => {
  for (const step of steps) {
    if (step.shouldSkip?.(context)) continue;

    context.spinner.start(step.spinnerText);

    try {
      await step.execute(context);
      context.spinner.succeed(step.name);
    } catch (error) {
      context.spinner.fail(step.name);
      throw error;
    }
  }
};
