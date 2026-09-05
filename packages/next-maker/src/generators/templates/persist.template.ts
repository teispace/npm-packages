export const persistTemplate = (params: {
  componentName: string;
  camelName: string;
  typesImportPath: string;
}): string => {
  const { componentName, camelName, typesImportPath } = params;
  const versionConst = `${camelName.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_PERSIST_VERSION`;
  return `import { definePersistence } from '@/store/persistence';

import type { ${componentName}State } from '${typesImportPath}';

const ${versionConst} = 1;

export const ${camelName}Persistence = definePersistence<${componentName}State>({
  key: '${camelName}',
  version: ${versionConst},
  // Fields that survive a reload. Transient status never should.
  pick: [],
  migrations: {
    // Bump ${versionConst} and add a step keyed by the new number when the
    // persisted shape changes. Each step receives the previous version's data
    // and returns the next; return \`undefined\` to discard.
    // 2: (previous) => ({ ...(previous as ${componentName}State), newField: 0 }),
  },
});
`;
};
