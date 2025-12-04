import path from 'node:path';
import degit from 'degit';
import { copyFile, deleteDirectory, fileExists } from '../../../core/files';
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
  await copyFile(
    path.join(tempDir, PROJECT_PATHS.APP_APIS),
    path.join(projectPath, PROJECT_PATHS.APP_APIS),
  );

  // src/lib/config/constants.ts (contains API_RESPONSE_DATA_KEY)
  await copyFile(
    path.join(tempDir, PROJECT_PATHS.CONSTANTS),
    path.join(projectPath, PROJECT_PATHS.CONSTANTS),
  );

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
  // 1. Remove Directories
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.HTTP_UTILS));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.STORAGE_SERVICE));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.ERRORS_DIR));

  // 2. Remove Files
  const filesToRemove = [PROJECT_PATHS.HTTP_TYPES, PROJECT_PATHS.APP_APIS, PROJECT_PATHS.CONSTANTS];

  for (const file of filesToRemove) {
    const filePath = path.join(projectPath, file);
    if (fileExists(filePath)) {
      await fs.unlink(filePath);
    }
  }

  // 3. Cleanup Types Directories if empty
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
