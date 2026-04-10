/**
 * Add an import statement after the last existing import in a file.
 * If no imports exist, prepends to the file.
 */
export const addImportStatement = (fileContent: string, importStatement: string): string => {
  const importRegex = /import\s+.*\s+from\s+['"].*['"];?\n/g;
  const imports = fileContent.match(importRegex);

  if (imports && imports.length > 0) {
    const lastImport = imports[imports.length - 1];
    const lastImportIndex = fileContent.lastIndexOf(lastImport);
    return (
      fileContent.slice(0, lastImportIndex + lastImport.length) +
      importStatement +
      '\n' +
      fileContent.slice(lastImportIndex + lastImport.length)
    );
  }

  return `${importStatement}\n${fileContent}`;
};

/**
 * Add a reducer entry to a combineReducers({...}) call.
 */
export const addToCombineReducers = (
  fileContent: string,
  reducerKey: string,
  reducerEntry: string,
): string => {
  const combineReducersRegex = /combineReducers\(\{([^}]*)\}\)/s;
  const match = fileContent.match(combineReducersRegex);

  if (!match) {
    throw new Error('Could not find combineReducers in rootReducer.ts');
  }

  const reducersContent = match[1];
  const newEntry = `\n  ${reducerKey}: ${reducerEntry},`;
  const updatedReducersContent = reducersContent.trimEnd() + newEntry;

  return fileContent.replace(
    combineReducersRegex,
    `combineReducers({${updatedReducersContent}\n})`,
  );
};

/**
 * Insert a new endpoint object before the closing `} as const;` of AppApis.
 */
export const addToAppApis = (fileContent: string, endpointBlock: string): string => {
  const insertPosition = fileContent.lastIndexOf('} as const;');
  if (insertPosition === -1) {
    throw new Error('Could not find closing brace of AppApis object');
  }

  const beforeClosing = fileContent.substring(0, insertPosition);
  const afterClosing = fileContent.substring(insertPosition);

  return `${beforeClosing.trimEnd()}\n${endpointBlock}\n${afterClosing}`;
};
