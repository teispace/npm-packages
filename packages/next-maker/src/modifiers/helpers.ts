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
 * Add a slice to a `combineSlices(...)` call, before the trailing
 * `persistSlice` when present so the persistence reducer stays last.
 */
export const addToCombineSlices = (fileContent: string, sliceIdentifier: string): string => {
  const re = /combineSlices\(([\s\S]*?)\)/;
  const match = fileContent.match(re);
  if (!match) throw new Error('Could not find combineSlices in rootReducer.ts');

  const args = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (args.includes(sliceIdentifier)) return fileContent;

  const persistIdx = args.indexOf('persistSlice');
  if (persistIdx === -1) args.push(sliceIdentifier);
  else args.splice(persistIdx, 0, sliceIdentifier);

  const oneLine = `combineSlices(${args.join(', ')})`;
  const multi = `combineSlices(\n  ${args.join(',\n  ')},\n)`;
  return fileContent.replace(re, oneLine.length <= 100 ? oneLine : multi);
};

/** Add a persistence entry to the `entries: [...]` array in `src/store/index.ts`. */
export const addToPersistenceEntries = (fileContent: string, entryIdentifier: string): string => {
  const re = /entries:\s*\[([\s\S]*?)\]/;
  const match = fileContent.match(re);
  if (!match) throw new Error('Could not find `entries: [...]` in src/store/index.ts');
  const entries = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.includes(entryIdentifier)) return fileContent;
  entries.push(entryIdentifier);
  return fileContent.replace(re, `entries: [${entries.join(', ')}]`);
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
