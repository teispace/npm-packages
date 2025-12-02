import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../../config/utils';

export interface SliceGenerationOptions {
  sliceName: string;
  slicePath: string;
  persistSlice: boolean;
}

export const generateSliceFiles = async (options: SliceGenerationOptions): Promise<void> => {
  const { sliceName, slicePath, persistSlice } = options;

  // Create slice directory
  await mkdir(slicePath, { recursive: true });

  const componentName = kebabToPascal(sliceName);
  const camelName = kebabToCamel(sliceName);

  // Generate types file
  await generateTypesFile(sliceName, slicePath, componentName);

  // Generate slice file
  await generateSliceFile(sliceName, slicePath, componentName, camelName);

  // Generate selectors file
  await generateSelectorsFile(sliceName, slicePath, componentName, camelName);

  // Generate persist file if needed
  if (persistSlice) {
    await generatePersistFile(sliceName, slicePath, componentName, camelName);
  }

  // Generate index file
  await generateIndexFile(sliceName, slicePath, persistSlice);
};

const generateTypesFile = async (
  sliceName: string,
  slicePath: string,
  componentName: string,
): Promise<void> => {
  const content = `export interface ${componentName}State {
  loading: boolean;
  error: string | null;
  // Add your state properties here
}
`;

  await writeFile(path.join(slicePath, `${sliceName}.types.ts`), content);
};

const generateSliceFile = async (
  sliceName: string,
  slicePath: string,
  componentName: string,
  camelName: string,
): Promise<void> => {
  const content = `import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ${componentName}State } from './${sliceName}.types';

const initialState: ${componentName}State = {
  loading: false,
  error: null,
  // Add your initial state here
};

export const ${camelName}Slice = createSlice({
  name: '${camelName}',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    resetState: (state) => {
      state.loading = false;
      state.error = null;
    },
  },
});

export const { setLoading, setError, resetState } = ${camelName}Slice.actions;

export const ${camelName}Reducer = ${camelName}Slice.reducer;
`;

  await writeFile(path.join(slicePath, `${sliceName}.slice.ts`), content);
};

const generateSelectorsFile = async (
  sliceName: string,
  slicePath: string,
  componentName: string,
  camelName: string,
): Promise<void> => {
  const content = `import { RootState } from '@/store/rootReducer';

export const select${componentName}State = (state: RootState) => state.${camelName};
export { setLoading, setError, resetState } from './${sliceName}.slice';
`;

  await writeFile(path.join(slicePath, `${sliceName}.selectors.ts`), content);
};

const generatePersistFile = async (
  sliceName: string,
  slicePath: string,
  componentName: string,
  camelName: string,
): Promise<void> => {
  const content = `import { PersistConfig } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { ${componentName}State } from './${sliceName}.types';

export const ${camelName}PersistConfig: PersistConfig<${componentName}State> = {
  key: '${camelName}',
  storage,
  // whitelist: ['someField'], // Specify which fields to persist
};
`;

  await writeFile(path.join(slicePath, 'persist.ts'), content);
};

const generateIndexFile = async (
  sliceName: string,
  slicePath: string,
  persistSlice: boolean,
): Promise<void> => {
  const content = `export * from './${sliceName}.slice';
export * from './${sliceName}.selectors';
export * from './${sliceName}.types';${persistSlice ? "\nexport * from './persist';" : ''}
`;

  await writeFile(path.join(slicePath, 'index.ts'), content);
};
