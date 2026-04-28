export const persistTemplate = (params: {
  componentName: string;
  camelName: string;
  typesImportPath: string;
}): string => {
  const { componentName, camelName, typesImportPath } = params;
  const versionConst = `${camelName.toUpperCase()}_PERSIST_VERSION`;
  return `import { createMigrate, type PersistConfig, type PersistedState } from 'redux-persist';
import storage from '@/store/storage';
import type { ${componentName}State } from '${typesImportPath}';

const ${versionConst} = 1;

const migrations = {
  // Bump ${versionConst} and add a migration here when ${componentName}State's
  // shape changes. Receives the previously-persisted state, returns the new
  // shape. Returning \`undefined\` discards stale state.
  // 2: (state) => ({ ...state, newField: defaultValue }),
} satisfies Record<number, (state: PersistedState) => PersistedState>;

export const ${camelName}PersistConfig: PersistConfig<${componentName}State> = {
  key: '${camelName}',
  storage,
  version: ${versionConst},
  // whitelist: ['someField'], // Specify which fields to persist
  migrate: createMigrate(migrations, { debug: false }),
};
`;
};
