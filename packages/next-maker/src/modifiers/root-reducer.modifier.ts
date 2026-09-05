import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../config/utils';
import { fileExists } from '../core/files';
import { addImportStatement, addToCombineSlices, addToPersistenceEntries } from './helpers';
import type { RegisterReducerOptions } from './types';

/**
 * Register a Redux slice: add it to `combineSlices(...)` in
 * `src/store/rootReducer.ts` and, when persisted, its `definePersistence`
 * entry to the `entries` list in `src/store/index.ts`.
 */
export const registerInRootReducer = async (options: RegisterReducerOptions): Promise<void> => {
  const { projectPath, name, persist, importPath } = options;
  const rootReducerPath = path.join(projectPath, 'src', 'store', 'rootReducer.ts');
  const storeIndexPath = path.join(projectPath, 'src', 'store', 'index.ts');
  const camelName = kebabToCamel(name);
  const aliasPath = importPath.replace(/^src\//, '@/');

  try {
    let content = await readFile(rootReducerPath, 'utf-8');
    content = addImportStatement(content, `import { ${camelName}Slice } from '${aliasPath}';`);
    content = addToCombineSlices(content, `${camelName}Slice`);
    await writeFile(rootReducerPath, content);

    if (persist && fileExists(storeIndexPath)) {
      let index = await readFile(storeIndexPath, 'utf-8');
      index = addImportStatement(index, `import { ${camelName}Persistence } from '${aliasPath}';`);
      index = addToPersistenceEntries(index, `${camelName}Persistence`);
      await writeFile(storeIndexPath, index);
    }
  } catch (error) {
    throw new Error(`Failed to register slice '${name}': ${error}`, { cause: error });
  }
};
