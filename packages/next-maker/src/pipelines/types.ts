import type { Ora } from 'ora';

export interface PipelineContext {
  projectPath: string;
  spinner: Ora;
}

export interface PipelineStep<TContext extends PipelineContext> {
  name: string;
  spinnerText: string;
  execute: (context: TContext) => Promise<void>;
  shouldSkip?: (context: TContext) => boolean;
}
