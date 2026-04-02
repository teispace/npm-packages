import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../../config/utils';

export interface FeatureGenerationOptions {
  featureName: string;
  featurePath: string;
  createStore: boolean;
  persistStore: boolean;
  createService: boolean;
  httpClient?: 'axios' | 'fetch';
}

export const generateFeatureStructure = async (
  options: FeatureGenerationOptions,
): Promise<void> => {
  const { featurePath } = options;

  // Create feature directories
  await mkdir(path.join(featurePath, 'components'), { recursive: true });
  await mkdir(path.join(featurePath, 'hooks'), { recursive: true });
  await mkdir(path.join(featurePath, 'types'), { recursive: true });

  if (options.createStore) {
    await mkdir(path.join(featurePath, 'store'), { recursive: true });
  }

  if (options.createService) {
    await mkdir(path.join(featurePath, 'services'), { recursive: true });
  }

  // Generate files
  await generateComponentFile(options);
  await generateHookFile(options);
  await generateTypesFile(options);
  await generateIndexFile(options);

  if (options.createStore) {
    await generateStoreFiles(options);
  }

  if (options.createService && options.httpClient) {
    await generateServiceFile(options);
  }
};

export const getProjectPathFromFeaturePath = (featurePath: string): string => {
  // Extract project root from feature path
  // featurePath format: /path/to/project/src/features/featureName
  const srcIndex = featurePath.indexOf('/src/features');
  if (srcIndex === -1) {
    throw new Error('Could not determine project path from feature path');
  }
  return featurePath.substring(0, srcIndex);
};

const generateComponentFile = async (options: FeatureGenerationOptions): Promise<void> => {
  const { featureName, featurePath } = options;
  const componentName = kebabToPascal(featureName);
  const hookName = `use${componentName}`;

  const content = `'use client';
import { ${hookName} } from '../hooks/${hookName}';

export function ${componentName}() {
  const {} = ${hookName}();

  return (
    <div>
      <h2>${componentName} Component</h2>
      {/* Add your component UI here */}
    </div>
  );
}

export default ${componentName};
`;

  await writeFile(path.join(featurePath, 'components', `${componentName}.tsx`), content);
};

const generateHookFile = async (options: FeatureGenerationOptions): Promise<void> => {
  const { featureName, featurePath, createStore } = options;
  const componentName = kebabToPascal(featureName);
  const hookName = `use${componentName}`;

  let content: string;

  if (createStore) {
    content = `'use client';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { select${componentName}State, setLoading, setError } from '../store/${featureName}.selectors';

export const ${hookName} = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(select${componentName}State);

  const handleSetLoading = (loading: boolean) => {
    dispatch(setLoading(loading));
    console.log('Loading state updated:', loading);
  };

  const handleSetError = (error: string | null) => {
    dispatch(setError(error));
    console.log('Error state updated:', error);
  };

  return {
    state,
    setLoading: handleSetLoading,
    setError: handleSetError,
  } as const;
};
`;
  } else {
    content = `'use client';
import { useState } from 'react';

export const ${hookName} = () => {
  // Add your state and logic here
  const [state, setState] = useState({});

  return {
    state,
    // Add your methods here
  } as const;
};
`;
  }

  await writeFile(path.join(featurePath, 'hooks', `${hookName}.ts`), content);
};

const generateTypesFile = async (options: FeatureGenerationOptions): Promise<void> => {
  const { featureName, featurePath, createStore } = options;
  const componentName = kebabToPascal(featureName);
  const typeName = `${componentName}State`;

  const content = `export interface ${typeName} {
  // Add your state properties here
  ${createStore ? 'loading: boolean;\n  error: string | null;' : '// example: value: string;'}
}
`;

  await writeFile(path.join(featurePath, 'types', `${featureName}.types.ts`), content);
};

const generateStoreFiles = async (options: FeatureGenerationOptions): Promise<void> => {
  const { featureName, featurePath, persistStore } = options;
  const componentName = kebabToPascal(featureName);
  const camelName = kebabToCamel(featureName);

  // Generate slice
  const sliceContent = `import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ${componentName}State } from '../types/${featureName}.types';

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

  await writeFile(path.join(featurePath, 'store', `${featureName}.slice.ts`), sliceContent);

  // Generate selectors
  const selectorsContent = `import { RootState } from '@/store/rootReducer';

export const select${componentName}State = (state: RootState) => state.${camelName};
export { setLoading, setError, resetState } from './${featureName}.slice';
`;

  await writeFile(path.join(featurePath, 'store', `${featureName}.selectors.ts`), selectorsContent);

  // Generate persist config if needed
  if (persistStore) {
    const persistContent = `import { PersistConfig } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { ${componentName}State } from '../types/${featureName}.types';

export const ${camelName}PersistConfig: PersistConfig<${componentName}State> = {
  key: '${camelName}',
  storage,
  // whitelist: ['someField'], // Specify which fields to persist
};
`;

    await writeFile(path.join(featurePath, 'store', 'persist.ts'), persistContent);
  }

  // Generate store index
  const storeIndexContent = `export * from './${featureName}.slice';
export * from './${featureName}.selectors';${persistStore ? "\nexport * from './persist';" : ''}
`;

  await writeFile(path.join(featurePath, 'store', 'index.ts'), storeIndexContent);
};

const generateServiceFile = async (options: FeatureGenerationOptions): Promise<void> => {
  const { featureName, featurePath, httpClient } = options;
  const camelName = kebabToCamel(featureName);

  let content: string;

  if (httpClient === 'axios') {
    content = `import { AppApis } from '@/lib/config';
import { axiosClient } from '@/lib/utils/http';
import { ResultAsync } from '@/types';

export const ${camelName}Service = {
  getAll: (): ResultAsync<string> => {
    return axiosClient.get<string>(AppApis.${camelName}.getAll);
  },
};
`;
  } else {
    // fetch
    content = `import { AppApis } from '@/lib/config';
import { fetchClient } from '@/lib/utils/http';
import { ResultAsync } from '@/types';

export const ${camelName}Service = {
  getAll: (): ResultAsync<string> => {
    return fetchClient.get<string>(AppApis.${camelName}.getAll);
  },
};
`;
  }

  await writeFile(path.join(featurePath, 'services', `${featureName}.service.ts`), content);
};

const generateIndexFile = async (options: FeatureGenerationOptions): Promise<void> => {
  const { featureName, featurePath, createStore, createService } = options;
  const componentName = kebabToPascal(featureName);

  const content = `export { default as ${componentName} } from './components/${componentName}';
export { use${componentName} } from './hooks/use${componentName}';
export * from './types/${featureName}.types';${createStore ? `\nexport * from './store';` : ''}${createService ? `\nexport * from './services/${featureName}.service';` : ''}
`;

  await writeFile(path.join(featurePath, 'index.ts'), content);
};
