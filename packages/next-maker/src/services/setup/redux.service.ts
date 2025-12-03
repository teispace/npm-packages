import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const getTemplatePath = (): string => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'Templates', 'nextjs-starter');
};

const checkIfReduxExists = async (projectPath: string): Promise<boolean> => {
  const storePath = path.join(projectPath, 'src', 'store');
  const storeProviderPath = path.join(projectPath, 'src', 'providers', 'StoreProvider.tsx');

  try {
    await access(storePath);
    await access(storeProviderPath);
    return true;
  } catch {
    return false;
  }
};

export const setupRedux = async (projectPath: string): Promise<boolean> => {
  const exists = await checkIfReduxExists(projectPath);

  if (exists) {
    return false; // Already exists, nothing installed
  }

  const templatePath = getTemplatePath();

  // Create store directory
  const storeDir = path.join(projectPath, 'src', 'store');
  await mkdir(storeDir, { recursive: true });
  await mkdir(path.join(storeDir, 'slices'), { recursive: true });

  // Copy store files
  await copyStoreFiles(templatePath, projectPath);

  // Copy StoreProvider
  await copyStoreProvider(templatePath, projectPath);

  // Update providers/index.ts
  await updateProvidersIndex(projectPath);

  // Update RootProvider
  await updateRootProvider(projectPath);

  return true; // Successfully installed
};

const copyStoreFiles = async (templatePath: string, projectPath: string): Promise<void> => {
  const storeFiles = ['index.ts', 'hooks.ts', 'persistor.ts', 'rootReducer.ts'];

  for (const file of storeFiles) {
    const srcPath = path.join(templatePath, 'src', 'store', file);
    const destPath = path.join(projectPath, 'src', 'store', file);

    const content = await readFile(srcPath, 'utf-8');
    await writeFile(destPath, content);
  }
};

const copyStoreProvider = async (templatePath: string, projectPath: string): Promise<void> => {
  const srcPath = path.join(templatePath, 'src', 'providers', 'StoreProvider.tsx');
  const destPath = path.join(projectPath, 'src', 'providers', 'StoreProvider.tsx');

  const content = await readFile(srcPath, 'utf-8');
  await writeFile(destPath, content);
};

const updateProvidersIndex = async (projectPath: string): Promise<void> => {
  const indexPath = path.join(projectPath, 'src', 'providers', 'index.ts');

  try {
    let content = await readFile(indexPath, 'utf-8');

    // Check if StoreProvider is already exported
    if (content.includes('StoreProvider')) {
      return;
    }

    // Add export for StoreProvider
    content += "\nexport { StoreProvider } from './StoreProvider';\n";

    await writeFile(indexPath, content);
  } catch {
    // If index.ts doesn't exist, create it
    const content = `export { StoreProvider } from './StoreProvider';
export { RootProvider } from './RootProvider';
`;
    await writeFile(indexPath, content);
  }
};

const updateRootProvider = async (projectPath: string): Promise<void> => {
  const rootProviderPath = path.join(projectPath, 'src', 'providers', 'RootProvider.tsx');

  try {
    let content = await readFile(rootProviderPath, 'utf-8');

    // Check if StoreProvider is already in use
    if (content.includes('StoreProvider')) {
      return;
    }

    // Update import to include StoreProvider
    if (content.includes("from '@/providers'")) {
      // Find existing import and add StoreProvider
      content = content.replace(
        /import \{ ([^}]+) \} from '@\/providers';/,
        "import { StoreProvider, $1 } from '@/providers';",
      );
    } else {
      // Add new import at the top after 'use client'
      const useClientIndex = content.indexOf("'use client';");
      if (useClientIndex !== -1) {
        const nextLineIndex = content.indexOf('\n', useClientIndex);
        content =
          content.slice(0, nextLineIndex + 1) +
          "import { StoreProvider } from '@/providers';\n" +
          content.slice(nextLineIndex + 1);
      }
    }

    // Wrap the entire return content with StoreProvider
    // Find the return statement
    const returnMatch = content.match(/(return\s*\(\s*)/);
    if (returnMatch) {
      const returnIndex = content.indexOf(returnMatch[0]);
      const returnStart = returnIndex + returnMatch[0].length;

      // Find the closing of the return statement
      let depth = 1;
      let closeIndex = returnStart;
      for (let i = returnStart; i < content.length; i++) {
        if (content[i] === '(') depth++;
        if (content[i] === ')') {
          depth--;
          if (depth === 0) {
            closeIndex = i;
            break;
          }
        }
      }

      // Insert StoreProvider wrapper
      const beforeReturn = content.slice(0, returnStart);
      const returnContent = content.slice(returnStart, closeIndex);
      const afterReturn = content.slice(closeIndex);

      content = `${beforeReturn}\n    <StoreProvider>\n${returnContent}\n    </StoreProvider>\n  ${afterReturn}`;
    }

    await writeFile(rootProviderPath, content);
  } catch (error) {
    throw new Error(`Failed to update RootProvider: ${error}`);
  }
};

export const isReduxSetup = async (projectPath: string): Promise<boolean> => {
  return await checkIfReduxExists(projectPath);
};

export const getReduxPackages = (): string[] => {
  return ['@reduxjs/toolkit', 'react-redux', 'redux-persist'];
};
