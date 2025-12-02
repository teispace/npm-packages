import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../../config/utils';

export const registerFeatureInRootReducer = async (
  projectPath: string,
  featureName: string,
  withPersist: boolean,
  basePath: string = path.join('src', 'features'),
): Promise<void> => {
  const rootReducerPath = path.join(projectPath, 'src', 'store', 'rootReducer.ts');

  try {
    let content = await readFile(rootReducerPath, 'utf-8');

    const camelName = kebabToCamel(featureName);
    const reducerName = `${camelName}Reducer`;
    const importName = withPersist ? `${camelName}PersistConfig` : '';

    // Convert path to import alias format (src/features -> @/features)
    const importPath = basePath.replace(/^src\//, '@/');

    // Add import statement
    const importStatement = withPersist
      ? `import { ${reducerName}, ${importName} } from '${importPath}/${featureName}/store';`
      : `import { ${reducerName} } from '${importPath}/${featureName}/store';`;

    // Find the last import statement
    const importRegex = /import\s+.*\s+from\s+['"].*['"];?\n/g;
    const imports = content.match(importRegex);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      content =
        content.slice(0, lastImportIndex + lastImport.length) +
        importStatement +
        '\n' +
        content.slice(lastImportIndex + lastImport.length);
    } else {
      // No imports found, add at the beginning
      content = importStatement + '\n' + content;
    }

    // Add reducer to combineReducers
    const combineReducersRegex = /combineReducers\(\{([^}]*)\}\)/s;
    const match = content.match(combineReducersRegex);

    if (match) {
      const reducersContent = match[1];
      const newReducerEntry = withPersist
        ? `\n  ${camelName}: persistReducer(${importName}, ${reducerName}),`
        : `\n  ${camelName}: ${reducerName},`;

      const updatedReducersContent = reducersContent.trimEnd() + newReducerEntry;
      content = content.replace(
        combineReducersRegex,
        `combineReducers({${updatedReducersContent}\n})`,
      );
    } else {
      throw new Error('Could not find combineReducers in rootReducer.ts');
    }

    await writeFile(rootReducerPath, content);
  } catch (error) {
    throw new Error(`Failed to register feature in rootReducer: ${error}`);
  }
};

/**
 * Register a slice in rootReducer (imports from index.ts, not store/)
 */
export const registerSliceInRootReducer = async (
  projectPath: string,
  sliceName: string,
  withPersist: boolean,
  basePath: string,
): Promise<void> => {
  const rootReducerPath = path.join(projectPath, 'src', 'store', 'rootReducer.ts');

  try {
    let content = await readFile(rootReducerPath, 'utf-8');

    const camelName = kebabToCamel(sliceName);
    const reducerName = `${camelName}Reducer`;
    const importName = withPersist ? `${camelName}PersistConfig` : '';

    // Convert path to import alias format (src/store -> @/store)
    const importPath = basePath.replace(/^src\//, '@/');

    // Add import statement (import from index, not /store)
    const importStatement = withPersist
      ? `import { ${reducerName}, ${importName} } from '${importPath}/${sliceName}';`
      : `import { ${reducerName} } from '${importPath}/${sliceName}';`;

    // Find the last import statement
    const importRegex = /import\s+.*\s+from\s+['"].*['"];?\n/g;
    const imports = content.match(importRegex);
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      content =
        content.slice(0, lastImportIndex + lastImport.length) +
        importStatement +
        '\n' +
        content.slice(lastImportIndex + lastImport.length);
    } else {
      // No imports found, add at the beginning
      content = importStatement + '\n' + content;
    }

    // Add reducer to combineReducers
    const combineReducersRegex = /combineReducers\(\{([^}]*)\}\)/s;
    const match = content.match(combineReducersRegex);

    if (match) {
      const reducersContent = match[1];
      const newReducerEntry = withPersist
        ? `\n  ${camelName}: persistReducer(${importName}, ${reducerName}),`
        : `\n  ${camelName}: ${reducerName},`;

      const updatedReducersContent = reducersContent.trimEnd() + newReducerEntry;
      content = content.replace(
        combineReducersRegex,
        `combineReducers({${updatedReducersContent}\n})`,
      );
    } else {
      throw new Error('Could not find combineReducers in rootReducer.ts');
    }

    await writeFile(rootReducerPath, content);
  } catch (error) {
    throw new Error(`Failed to register slice in rootReducer: ${error}`);
  }
};
