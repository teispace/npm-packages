import path from 'node:path';
import { writeFile } from '../core/files';
import {
  componentTestTemplate,
  hookTestTemplate,
  sliceTestTemplate,
} from './templates/test.template';

export type TestKind = 'component' | 'hook' | 'slice';

export type GenerateTestOptions = {
  projectPath: string;
  /** Absolute path to the source file being tested. */
  sourceFile: string;
  kind: TestKind;
  /** Component/hook/slice identifier (e.g. "Counter", "useCounter", "counter"). */
  symbolName: string;
  hasRedux?: boolean;
  hasI18n?: boolean;
  /** Whether the hook uses the Redux store (only relevant for `kind === 'hook'`). */
  hookUsesStore?: boolean;
};

/**
 * Emit a sibling *.test.{ts,tsx} next to the source file. Returns the path
 * that was written.
 */
export const generateTest = async (options: GenerateTestOptions): Promise<string> => {
  const { projectPath, sourceFile, kind, symbolName } = options;
  const testDir = path.dirname(sourceFile);
  const sourceBaseName = path.basename(sourceFile).replace(/\.(tsx?|jsx?)$/i, '');
  const extension = kind === 'component' ? '.tsx' : '.ts';
  const testFile = path.join(testDir, `${sourceBaseName}.test${extension}`);

  const sourceImportPath = `./${sourceBaseName}`;
  const testUtilsImportPath = relativeImport(testDir, path.join(projectPath, 'test', 'test-utils'));

  let content: string;
  if (kind === 'component') {
    content = componentTestTemplate({
      componentName: symbolName,
      sourceImportPath,
      testUtilsImportPath,
      hasRedux: !!options.hasRedux,
      hasI18n: !!options.hasI18n,
    });
  } else if (kind === 'hook') {
    content = hookTestTemplate({
      hookName: symbolName,
      sourceImportPath,
      withStore: !!options.hookUsesStore,
      testUtilsImportPath: options.hookUsesStore ? testUtilsImportPath : undefined,
    });
  } else {
    content = sliceTestTemplate({
      camelName: symbolName,
      sourceImportPath,
    });
  }

  await writeFile(testFile, content);
  return testFile;
};

const relativeImport = (from: string, to: string): string => {
  const rel = path.relative(from, to).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};
