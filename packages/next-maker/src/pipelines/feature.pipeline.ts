import path from 'node:path';
import type { ProjectDetection } from '../detection';
import { detectProjectSetup } from '../detection';
import { generateFeature } from '../generators';
import { registerApiEndpoints, registerInRootReducer } from '../modifiers';
import type { PipelineContext, PipelineStep } from './types';

export interface FeaturePipelineContext extends PipelineContext {
  featureName: string;
  basePath: string;
  featurePath: string;
  createStore: boolean;
  persistStore: boolean;
  createService: boolean;
  httpClient?: 'axios' | 'fetch';
  detection: ProjectDetection;
}

export const createFeaturePipelineSteps = (): PipelineStep<FeaturePipelineContext>[] => [
  {
    name: 'Project setup detected',
    spinnerText: 'Detecting project setup...',
    execute: async (ctx) => {
      ctx.detection = await detectProjectSetup(ctx.projectPath);
    },
  },
  {
    name: 'Feature files generated',
    spinnerText: 'Generating feature files...',
    execute: async (ctx) => {
      await generateFeature({
        name: ctx.featureName,
        outputPath: ctx.featurePath,
        createStore: ctx.createStore,
        persistStore: ctx.persistStore,
        createService: ctx.createService,
        httpClient: ctx.httpClient,
      });
    },
  },
  {
    name: 'API endpoints registered',
    spinnerText: 'Registering API endpoints...',
    shouldSkip: (ctx) => !ctx.createService,
    execute: async (ctx) => {
      await registerApiEndpoints({
        serviceName: ctx.featureName,
        projectPath: ctx.projectPath,
      });
    },
  },
  {
    name: 'Feature registered in rootReducer',
    spinnerText: 'Registering feature in rootReducer...',
    shouldSkip: (ctx) => !ctx.createStore || !ctx.detection.hasRedux,
    execute: async (ctx) => {
      await registerInRootReducer({
        projectPath: ctx.projectPath,
        name: ctx.featureName,
        persist: ctx.persistStore,
        importPath: path.join(ctx.basePath, ctx.featureName, 'store'),
      });
    },
  },
];
