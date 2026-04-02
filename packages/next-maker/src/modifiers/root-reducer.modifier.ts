import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../config/utils';
import { addImportStatement, addToCombineReducers } from './helpers';
import type { RegisterReducerOptions } from './types';

/**
 * Register a reducer in rootReducer.ts — unified handler for both
 * feature-embedded slices (import from /store) and standalone slices.
 */
export const registerInRootReducer = async (options: RegisterReducerOptions): Promise<void> => {
  const { projectPath, name, persist, importPath } = options;
  const rootReducerPath = path.join(projectPath, 'src', 'store', 'rootReducer.ts');

  try {
    let content = await readFile(rootReducerPath, 'utf-8');

    const camelName = kebabToCamel(name);
    const reducerName = `${camelName}Reducer`;
    const persistConfigName = `${camelName}PersistConfig`;

    // Convert path to import alias format (src/... -> @/...)
    const aliasPath = importPath.replace(/^src\//, '@/');

    // Build import statement
    const importStatement = persist
      ? `import { ${reducerName}, ${persistConfigName} } from '${aliasPath}';`
      : `import { ${reducerName} } from '${aliasPath}';`;

    content = addImportStatement(content, importStatement);

    // Build reducer entry
    const reducerEntry = persist
      ? `persistReducer(${persistConfigName}, ${reducerName})`
      : reducerName;

    content = addToCombineReducers(content, camelName, reducerEntry);

    await writeFile(rootReducerPath, content);
  } catch (error) {
    throw new Error(`Failed to register reducer '${name}' in rootReducer: ${error}`, {
      cause: error,
    });
  }
};
