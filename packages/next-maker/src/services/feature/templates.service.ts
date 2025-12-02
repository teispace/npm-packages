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
import { select${componentName}State } from '../store/${featureName}.selectors';

export const ${hookName} = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(select${componentName}State);

  // Add your actions here
  // const handleAction = () => dispatch(someAction());

  return {
    state,
    // Add your methods here
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
    // Add your reducers here
    // Example:
    // setLoading: (state, action: PayloadAction<boolean>) => {
    //   state.loading = action.payload;
    // },
  },
});

export const {
  // Export your actions here
} = ${camelName}Slice.actions;

export const ${camelName}Reducer = ${camelName}Slice.reducer;
`;

  await writeFile(path.join(featurePath, 'store', `${featureName}.slice.ts`), sliceContent);

  // Generate selectors
  const selectorsContent = `import { RootState } from '@/store/rootReducer';

export const select${componentName}State = (state: RootState) => state.${camelName};
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
    content = `import axios from 'axios';

// Configure your axios instance
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
});

export const ${camelName}Service = {
  // Add your API methods here
  // Example:
  // getAll: async () => {
  //   const response = await apiClient.get('/${featureName}');
  //   return response.data;
  // },
  //
  // getById: async (id: string) => {
  //   const response = await apiClient.get(\`/${featureName}/\${id}\`);
  //   return response.data;
  // },
  //
  // create: async (data: any) => {
  //   const response = await apiClient.post('/${featureName}', data);
  //   return response.data;
  // },
  //
  // update: async (id: string, data: any) => {
  //   const response = await apiClient.put(\`/${featureName}/\${id}\`, data);
  //   return response.data;
  // },
  //
  // delete: async (id: string) => {
  //   const response = await apiClient.delete(\`/${featureName}/\${id}\`);
  //   return response.data;
  // },
};
`;
  } else {
    // fetch
    content = `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Helper function for fetch requests
const fetchAPI = async (endpoint: string, options?: RequestInit) => {
  const response = await fetch(\`\${API_URL}\${endpoint}\`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }

  return response.json();
};

export const ${camelName}Service = {
  // Add your API methods here
  // Example:
  // getAll: async () => {
  //   return fetchAPI('/${featureName}');
  // },
  //
  // getById: async (id: string) => {
  //   return fetchAPI(\`/${featureName}/\${id}\`);
  // },
  //
  // create: async (data: any) => {
  //   return fetchAPI('/${featureName}', {
  //     method: 'POST',
  //     body: JSON.stringify(data),
  //   });
  // },
  //
  // update: async (id: string, data: any) => {
  //   return fetchAPI(\`/${featureName}/\${id}\`, {
  //     method: 'PUT',
  //     body: JSON.stringify(data),
  //   });
  // },
  //
  // delete: async (id: string) => {
  //   return fetchAPI(\`/${featureName}/\${id}\`, {
  //     method: 'DELETE',
  //   });
  // },
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
