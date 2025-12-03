import path from 'node:path';
import degit from 'degit';
import { copyFile, deleteDirectory } from '../../../core/files';
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
  clientType: 'fetch' | 'axios',
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

  // 2. Copy Specific Client
  if (clientType === 'fetch') {
    await fs.cp(
      path.join(tempDir, PROJECT_PATHS.FETCH_CLIENT),
      path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT),
      { recursive: true },
    );
    // Remove Axios if exists (cleanup)
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT));
  } else {
    await fs.cp(
      path.join(tempDir, PROJECT_PATHS.AXIOS_CLIENT),
      path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT),
      { recursive: true },
    );
    // Remove Fetch if exists (cleanup)
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT));
  }

  // 3. Copy/Update http/index.ts
  await copyFile(path.join(tempHttpUtilsPath, 'index.ts'), path.join(httpUtilsPath, 'index.ts'));

  // 4. Copy http.types.ts
  await copyFile(
    path.join(tempDir, PROJECT_PATHS.HTTP_TYPES),
    path.join(projectPath, PROJECT_PATHS.HTTP_TYPES),
  );
};
