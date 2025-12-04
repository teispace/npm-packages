import path from 'node:path';
import degit from 'degit';
import { copyFile, deleteDirectory, fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { Ora } from 'ora';
import fs from 'node:fs/promises';

export const fetchAssets = async (tempDir: string, spinner: Ora): Promise<void> => {
  spinner.text = 'Downloading assets from starter repository...';
  const emitter = degit('teispace/nextjs-starter', {
    cache: false,
    force: true,
    verbose: false,
  });
  await emitter.clone(tempDir);
};

export const copyHttpClientFiles = async (
  projectPath: string,
  tempDir: string,
  clients: ('fetch' | 'axios')[],
  removeClients?: ('fetch' | 'axios')[],
): Promise<void> => {
  const httpUtilsPath = path.join(projectPath, PROJECT_PATHS.HTTP_UTILS);
  const tempHttpUtilsPath = path.join(tempDir, PROJECT_PATHS.HTTP_UTILS);

  // 1. Copy Common Files
  // src/types/errors
  await fs.cp(
    path.join(tempDir, PROJECT_PATHS.ERRORS_DIR),
    path.join(projectPath, PROJECT_PATHS.ERRORS_DIR),
    { recursive: true },
  );

  // src/lib/config/app-apis.ts
  const appApisPath = path.join(projectPath, PROJECT_PATHS.APP_APIS);
  if (!fileExists(appApisPath)) {
    await copyFile(path.join(tempDir, PROJECT_PATHS.APP_APIS), appApisPath);
  }

  // src/lib/config/constants.ts (contains API_RESPONSE_DATA_KEY)
  const constantsPath = path.join(projectPath, PROJECT_PATHS.CONSTANTS);
  if (!fileExists(constantsPath)) {
    await copyFile(path.join(tempDir, PROJECT_PATHS.CONSTANTS), constantsPath);
  } else {
    // Ensure API_RESPONSE_DATA_KEY exists if file is kept
    let content = await readFile(constantsPath);
    let modified = false;

    if (!content.includes('API_RESPONSE_DATA_KEY')) {
      content += "\nexport const API_RESPONSE_DATA_KEY = 'data';\n";
      modified = true;
    }

    if (!content.includes('SAVE_AUTH_TOKENS')) {
      content += '\nexport const SAVE_AUTH_TOKENS = false;\n';
      modified = true;
    }

    if (modified) {
      await writeFile(constantsPath, content);
    }
  }

  // src/services/storage (needed by token-store.ts) - only if doesn't exist
  const storageServicePath = path.join(projectPath, PROJECT_PATHS.STORAGE_SERVICE);
  if (!fileExists(storageServicePath)) {
    await fs.cp(path.join(tempDir, PROJECT_PATHS.STORAGE_SERVICE), storageServicePath, {
      recursive: true,
    });
  }

  // Restore common and utility types (needed for http types)
  await fs.cp(
    path.join(tempDir, PROJECT_PATHS.COMMON_TYPES_DIR),
    path.join(projectPath, PROJECT_PATHS.COMMON_TYPES_DIR),
    { recursive: true },
  );
  await fs.cp(
    path.join(tempDir, PROJECT_PATHS.UTILITY_TYPES_DIR),
    path.join(projectPath, PROJECT_PATHS.UTILITY_TYPES_DIR),
    { recursive: true },
  );

  // 2. Copy HTTP Shared Utilities
  // token-store.ts
  await copyFile(
    path.join(tempHttpUtilsPath, 'token-store.ts'),
    path.join(httpUtilsPath, 'token-store.ts'),
  );

  // client-utils.ts
  await copyFile(
    path.join(tempHttpUtilsPath, 'client-utils.ts'),
    path.join(httpUtilsPath, 'client-utils.ts'),
  );

  // 3. Remove specified clients if requested
  if (removeClients && removeClients.length > 0) {
    for (const client of removeClients) {
      const clientPath = path.join(
        projectPath,
        client === 'fetch' ? PROJECT_PATHS.FETCH_CLIENT : PROJECT_PATHS.AXIOS_CLIENT,
      );
      await deleteDirectory(clientPath);
    }
  }

  // 4. Copy specified client(s)
  for (const client of clients) {
    if (client === 'fetch') {
      await fs.cp(
        path.join(tempDir, PROJECT_PATHS.FETCH_CLIENT),
        path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT),
        { recursive: true },
      );
    } else {
      await fs.cp(
        path.join(tempDir, PROJECT_PATHS.AXIOS_CLIENT),
        path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT),
        { recursive: true },
      );
    }
  }

  // 5. Copy/Update http/index.ts
  await copyFile(path.join(tempHttpUtilsPath, 'index.ts'), path.join(httpUtilsPath, 'index.ts'));

  // 6. Copy http.types.ts
  await copyFile(
    path.join(tempDir, PROJECT_PATHS.HTTP_TYPES),
    path.join(projectPath, PROJECT_PATHS.HTTP_TYPES),
  );
};

export const performFullCleanup = async (projectPath: string): Promise<void> => {
  const { isFileUsed, isStringUsed } = await import('./injectors');

  // 1. Remove Directories (Unconditional for HTTP utils as they are client-specific)
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.HTTP_UTILS));

  // Check storage service usage before deletion
  const storageServicePath = path.join(projectPath, PROJECT_PATHS.STORAGE_SERVICE);
  if (fileExists(storageServicePath)) {
    // Check if SecureStorageService is used anywhere else (excluding the service itself)
    // Note: HTTP_UTILS is already deleted, so we don't need to exclude it.
    const isUsed = await isStringUsed(projectPath, 'SecureStorageService', [storageServicePath]);
    if (!isUsed) {
      await deleteDirectory(storageServicePath);
    }
  }

  // 2. Smart Cleanup for Shared Files

  // Helper to delete file if unused and clean up its export
  const deleteIfUnused = async (
    filePath: string,
    checkFn: () => Promise<boolean>,
    indexFile: string,
    exportPattern: RegExp,
  ) => {
    if (!fileExists(filePath)) return;

    const isUsed = await checkFn();

    if (!isUsed) {
      await fs.unlink(filePath);

      // Remove export from index file
      if (fileExists(indexFile)) {
        let content = await readFile(indexFile);
        content = content.replace(exportPattern, '');
        await writeFile(indexFile, content);
      }
    }
  };

  // Check app-apis.ts - Check for 'AppApis' symbol usage
  const appApisPath = path.join(projectPath, PROJECT_PATHS.APP_APIS);
  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);

  await deleteIfUnused(
    appApisPath,
    () => isStringUsed(projectPath, 'AppApis', [appApisPath, configIndexPath]),
    configIndexPath,
    /export \* from '\.\/app-apis';\n?/g,
  );

  // Check constants.ts - Check for 'API_RESPONSE_DATA_KEY' symbol usage
  const constantsPath = path.join(projectPath, PROJECT_PATHS.CONSTANTS);
  if (fileExists(constantsPath)) {
    // Check if 'API_RESPONSE_DATA_KEY' is used (most common export)
    // Also check 'SAVE_AUTH_TOKENS' just in case
    const isUsed =
      (await isStringUsed(projectPath, 'API_RESPONSE_DATA_KEY', [constantsPath])) ||
      (await isStringUsed(projectPath, 'SAVE_AUTH_TOKENS', [constantsPath]));

    if (!isUsed) {
      await fs.unlink(constantsPath);
    }
  }

  // Check errors directory
  const errorsDir = path.join(projectPath, PROJECT_PATHS.ERRORS_DIR);
  if (fileExists(errorsDir)) {
    // Check if any file in errors dir is used
    const errorFiles = await fs.readdir(errorsDir);
    let isAnyErrorUsed = false;

    for (const file of errorFiles) {
      const name = path.parse(file).name; // e.g. 'api-error'
      // Check for usage of this file module (e.g. from '.../api-error')
      // AND check for class name usage if possible?
      // For now, checking import path is safer for errors as they are usually imported directly or via index
      if (await isFileUsed(projectPath, name, [path.join(errorsDir, file)])) {
        isAnyErrorUsed = true;
        break;
      }
    }

    if (!isAnyErrorUsed) {
      await deleteDirectory(errorsDir);
    }
  }

  // 3. Remove http.types.ts (Always remove as it's specific to this setup,
  // but we should check usage? No, it's generated/copied for this feature.
  // But wait, if user imported it elsewhere?
  // The user said "delete only client things not whole other files".
  // http.types.ts IS a client thing. So we delete it.)
  const httpTypesPath = path.join(projectPath, PROJECT_PATHS.HTTP_TYPES);
  if (fileExists(httpTypesPath)) {
    await fs.unlink(httpTypesPath);
  }

  // 4. Cleanup Types Directories if empty
  // Check common types
  const commonTypesPath = path.join(projectPath, PROJECT_PATHS.COMMON_TYPES_DIR);
  if (fileExists(commonTypesPath)) {
    const files = await fs.readdir(commonTypesPath);
    if (files.length === 0) {
      await deleteDirectory(commonTypesPath);
    }
  }

  // Check utility types
  const utilityTypesPath = path.join(projectPath, PROJECT_PATHS.UTILITY_TYPES_DIR);
  if (fileExists(utilityTypesPath)) {
    const files = await fs.readdir(utilityTypesPath);
    if (files.length === 0) {
      await deleteDirectory(utilityTypesPath);
    }
  }
};
