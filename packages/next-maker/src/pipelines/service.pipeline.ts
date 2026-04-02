import { generateService } from '../generators';
import { registerApiEndpoints } from '../modifiers';
import type { PipelineContext, PipelineStep } from './types';

export interface ServicePipelineContext extends PipelineContext {
  serviceName: string;
  servicePath: string;
  httpClient: 'axios' | 'fetch';
}

export const createServicePipelineSteps = (): PipelineStep<ServicePipelineContext>[] => [
  {
    name: 'Service files generated',
    spinnerText: 'Generating service files...',
    execute: async (ctx) => {
      await generateService({
        name: ctx.serviceName,
        outputPath: ctx.servicePath,
        httpClient: ctx.httpClient,
      });
    },
  },
  {
    name: 'API endpoints registered',
    spinnerText: 'Registering API endpoints...',
    execute: async (ctx) => {
      await registerApiEndpoints({
        serviceName: ctx.serviceName,
        projectPath: ctx.projectPath,
      });
    },
  },
];
