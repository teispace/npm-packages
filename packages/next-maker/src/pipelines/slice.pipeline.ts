import path from 'node:path';
import { generateSlice } from '../generators';
import { registerInRootReducer } from '../modifiers';
import type { PipelineContext, PipelineStep } from './types';

export interface SlicePipelineContext extends PipelineContext {
  sliceName: string;
  basePath: string;
  slicePath: string;
  persistSlice: boolean;
}

export const createSlicePipelineSteps = (): PipelineStep<SlicePipelineContext>[] => [
  {
    name: 'Slice files generated',
    spinnerText: 'Generating slice files...',
    execute: async (ctx) => {
      await generateSlice({
        name: ctx.sliceName,
        outputPath: ctx.slicePath,
        persist: ctx.persistSlice,
      });
    },
  },
  {
    name: 'Slice registered in rootReducer',
    spinnerText: 'Registering slice in rootReducer...',
    execute: async (ctx) => {
      await registerInRootReducer({
        projectPath: ctx.projectPath,
        name: ctx.sliceName,
        persist: ctx.persistSlice,
        importPath: path.join(ctx.basePath, ctx.sliceName),
      });
    },
  },
];
