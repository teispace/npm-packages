export const persistTemplate = (params: {
  componentName: string;
  camelName: string;
  typesImportPath: string;
}): string => {
  const { componentName, camelName, typesImportPath } = params;
  return `import type { PersistConfig } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import type { ${componentName}State } from '${typesImportPath}';

export const ${camelName}PersistConfig: PersistConfig<${componentName}State> = {
  key: '${camelName}',
  storage,
  // whitelist: ['someField'], // Specify which fields to persist
};
`;
};
