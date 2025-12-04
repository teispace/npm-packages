import path from 'node:path';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const updateHttpIndex = async (
  projectPath: string,
  clients: ('fetch' | 'axios')[],
): Promise<void> => {
  const httpIndexPath = path.join(projectPath, PROJECT_PATHS.HTTP_UTILS, 'index.ts');
  if (fileExists(httpIndexPath)) {
    let content = await readFile(httpIndexPath);

    // Remove all client exports first
    content = content.replace(/export .* from '\.\/axios-client';?\n?/g, '');
    content = content.replace(/export .* from '\.\/fetch-client';?\n?/g, '');

    // Add exports for active clients
    if (clients.includes('fetch') && !content.includes('fetch-client')) {
      content += "export * from './fetch-client';\n";
    }
    if (clients.includes('axios') && !content.includes('axios-client')) {
      content += "export * from './axios-client';\n";
    }

    await writeFile(httpIndexPath, content);
  }
};

export const updateUtilsIndex = async (projectPath: string): Promise<void> => {
  const utilsIndexPath = path.join(projectPath, PROJECT_PATHS.UTILS_INDEX);
  if (fileExists(utilsIndexPath)) {
    let content = await readFile(utilsIndexPath);
    if (!content.includes('./http')) {
      content += "export * from './http';\n";
      await writeFile(utilsIndexPath, content);
    }
  }
};

export const updateTypesIndex = async (projectPath: string): Promise<void> => {
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);
    if (!content.includes('./common')) {
      content += "export * from './common';\n";
    }
    if (!content.includes('./utility')) {
      content += "export * from './utility';\n";
    }
    await writeFile(typesIndexPath, content);
  }
};

export const updateConfigIndex = async (projectPath: string): Promise<void> => {
  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
  if (fileExists(configIndexPath)) {
    let content = await readFile(configIndexPath);
    if (!content.includes('./app-apis')) {
      content += "export * from './app-apis';\n";
      await writeFile(configIndexPath, content);
    }
  }
};

export const cleanupHttpTypes = async (
  projectPath: string,
  clients: ('fetch' | 'axios')[],
): Promise<void> => {
  const httpTypesPath = path.join(projectPath, PROJECT_PATHS.HTTP_TYPES);
  if (fileExists(httpTypesPath)) {
    let content = await readFile(httpTypesPath);

    // If axios is NOT in clients, remove the axios module declaration
    if (!clients.includes('axios')) {
      // Remove declare module 'axios' { ... } block
      // Matches: declare module 'axios' { export interface AxiosRequestConfig { ... } }
      content = content.replace(
        /declare module 'axios'\s*\{\s*export interface AxiosRequestConfig\s*\{[\s\S]*?\}\s*\}/g,
        '',
      );
      // Clean up any double newlines left behind
      content = content.replace(/\n\s*\n/g, '\n\n').trim() + '\n';
      await writeFile(httpTypesPath, content);
    }
  }
};

/**
 * Migrate all HTTP client import and usage patterns when replacing one client with another
 * Example: fetch -> axios will replace all fetchClient imports/usages with axiosClient
 */
export const migrateClientUsages = async (
  projectPath: string,
  fromClient: 'fetch' | 'axios',
  toClient: 'fetch' | 'axios',
): Promise<void> => {
  if (fromClient === toClient) return;

  const fromName = fromClient === 'fetch' ? 'fetchClient' : 'axiosClient';
  const toName = toClient === 'fetch' ? 'fetchClient' : 'axiosClient';
  const fromPath = fromClient === 'fetch' ? 'fetch-client' : 'axios-client';
  const toPath = toClient === 'fetch' ? 'fetch-client' : 'axios-client';

  // Find all .ts and .tsx files in src directory
  const srcPath = path.join(projectPath, 'src');

  try {
    // Use grep to find files with HTTP client imports
    const grepCommand = `grep -rl "${fromName}" "${srcPath}" --include="*.ts" --include="*.tsx" || true`;
    const { stdout } = await execAsync(grepCommand);

    if (!stdout.trim()) {
      // No files found with the client name
      return;
    }

    const filePaths = stdout
      .trim()
      .split('\n')
      .filter((f) => f);

    for (const filePath of filePaths) {
      if (!fileExists(filePath)) continue;

      let content = await readFile(filePath);
      let modified = false;

      // Replace import statements
      // Pattern 1: import { fetchClient } from '@/lib/http'
      const namedImportRegex = new RegExp(
        `(import\\s*\\{[^}]*?)\\b${fromName}\\b([^}]*?\\}\\s*from\\s*['"][^'"]*?/http['"])`,
        'g',
      );
      if (namedImportRegex.test(content)) {
        content = content.replace(namedImportRegex, `$1${toName}$2`);
        modified = true;
      }

      // Pattern 2: import fetchClient from '@/lib/http/fetch-client'
      const defaultImportRegex = new RegExp(
        `import\\s+${fromName}\\s+from\\s+['"]([^'"]*?)/${fromPath}['"]`,
        'g',
      );
      if (defaultImportRegex.test(content)) {
        content = content.replace(defaultImportRegex, `import ${toName} from '$1/${toPath}'`);
        modified = true;
      }

      // Pattern 3: Replace all usage instances (e.g., fetchClient.get -> axiosClient.get)
      const usageRegex = new RegExp(`\\b${fromName}\\b(?=\\.)`, 'g');
      if (usageRegex.test(content)) {
        content = content.replace(usageRegex, toName);
        modified = true;
      }

      // Pattern 4: Replace standalone references (e.g., const api = fetchClient)
      const standaloneRegex = new RegExp(`\\b${fromName}\\b(?![.\\w])`, 'g');
      if (standaloneRegex.test(content)) {
        content = content.replace(standaloneRegex, toName);
        modified = true;
      }

      if (modified) {
        await writeFile(filePath, content);
      }
    }
  } catch (error) {
    // If grep fails or no matches found, silently continue
    console.warn('Warning: Could not scan for HTTP client usages:', error);
  }
};

export const removeHttpExports = async (projectPath: string): Promise<void> => {
  // 1. Remove from utils/index.ts
  const utilsIndexPath = path.join(projectPath, PROJECT_PATHS.UTILS_INDEX);
  if (fileExists(utilsIndexPath)) {
    let content = await readFile(utilsIndexPath);
    content = content.replace(/export \* from '\.\/http';\n?/g, '');
    await writeFile(utilsIndexPath, content);
  }

  // 2. Remove from types/index.ts
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);

    // Check common types
    const commonTypesDir = path.join(projectPath, PROJECT_PATHS.COMMON_TYPES_DIR);
    if (!fileExists(commonTypesDir)) {
      content = content.replace(/export \* from '\.\/common';\n?/g, '');
    } else {
      // If directory exists, check if we need to remove http.types export from common/index.ts
      const commonIndexPath = path.join(commonTypesDir, 'index.ts');
      if (fileExists(commonIndexPath)) {
        let commonContent = await readFile(commonIndexPath);
        commonContent = commonContent.replace(/export \* from '\.\/http\.types';\n?/g, '');
        await writeFile(commonIndexPath, commonContent);
      }
    }

    // Check utility types
    if (!fileExists(path.join(projectPath, PROJECT_PATHS.UTILITY_TYPES_DIR))) {
      content = content.replace(/export \* from '\.\/utility';\n?/g, '');
    }
    await writeFile(typesIndexPath, content);
  }

  // 3. Remove from config/index.ts
  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
  if (fileExists(configIndexPath)) {
    let content = await readFile(configIndexPath);
    content = content.replace(/export \* from '\.\/app-apis';\n?/g, '');
    await writeFile(configIndexPath, content);
  }
};
