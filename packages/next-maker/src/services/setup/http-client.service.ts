import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type HttpClientType = 'axios' | 'fetch' | 'both';

interface SetupHttpClientOptions {
  projectPath: string;
  clientType: HttpClientType;
}

const getTemplatePath = (): string => {
  // Get the directory of this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Navigate to the template directory
  // From: packages/next-maker/src/services/setup/
  // To: ../../../../Templates/nextjs-starter/
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'Templates', 'nextjs-starter');
};

const checkIfClientExists = async (
  projectPath: string,
  clientType: 'axios' | 'fetch',
): Promise<boolean> => {
  const clientPath = path.join(projectPath, 'src', 'lib', 'utils', 'http', `${clientType}-client`);
  try {
    await access(clientPath);
    return true;
  } catch {
    return false;
  }
};

const copyDirectory = async (src: string, dest: string): Promise<void> => {
  // Create destination directory
  await mkdir(dest, { recursive: true });

  // Read all files and directories in source
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      const content = await readFile(srcPath, 'utf-8');
      await writeFile(destPath, content);
    }
  }
};

const updateHttpIndex = async (projectPath: string, clientType: HttpClientType): Promise<void> => {
  const indexPath = path.join(projectPath, 'src', 'lib', 'utils', 'http', 'index.ts');

  // Ensure http directory exists
  await mkdir(path.dirname(indexPath), { recursive: true });

  let content = '';

  // Check if index.ts already exists
  try {
    content = await readFile(indexPath, 'utf-8');
  } catch {
    // File doesn't exist, will create new one
  }

  const exports: string[] = [];
  const existingExports = new Set<string>();

  // Parse existing exports
  if (content) {
    const exportMatches = content.matchAll(/export \{ .+ \} from '\.\/(.+)';/g);
    for (const match of exportMatches) {
      existingExports.add(match[1]);
    }
  }

  // Add axios client exports
  if ((clientType === 'axios' || clientType === 'both') && !existingExports.has('axios-client')) {
    exports.push("export { axiosClient } from './axios-client';");
    exports.push("export { createAxiosClient } from './axios-client';");
  } else if (existingExports.has('axios-client')) {
    exports.push("export { axiosClient } from './axios-client';");
    exports.push("export { createAxiosClient } from './axios-client';");
  }

  // Add fetch client exports
  if ((clientType === 'fetch' || clientType === 'both') && !existingExports.has('fetch-client')) {
    exports.push("export { fetchClient } from './fetch-client';");
    exports.push("export { createFetchClient } from './fetch-client';");
  } else if (existingExports.has('fetch-client')) {
    exports.push("export { fetchClient } from './fetch-client';");
    exports.push("export { createFetchClient } from './fetch-client';");
  }

  // Add token-store export if not exists
  if (!content.includes("export * from './token-store'")) {
    exports.push("export * from './token-store';");
  } else {
    exports.push("export * from './token-store';");
  }

  await writeFile(indexPath, exports.join('\n') + '\n');
};

const copySharedFiles = async (projectPath: string): Promise<void> => {
  const templatePath = getTemplatePath();
  const httpTemplatePath = path.join(templatePath, 'src', 'lib', 'utils', 'http');
  const httpProjectPath = path.join(projectPath, 'src', 'lib', 'utils', 'http');

  // Create http directory
  await mkdir(httpProjectPath, { recursive: true });

  // Copy shared files
  const sharedFiles = ['client-utils.ts', 'token-store.ts'];

  for (const file of sharedFiles) {
    const srcPath = path.join(httpTemplatePath, file);
    const destPath = path.join(httpProjectPath, file);

    try {
      const content = await readFile(srcPath, 'utf-8');
      await writeFile(destPath, content);
    } catch {
      // File might not exist in template, skip
      console.warn(`Warning: Could not copy ${file}`);
    }
  }
};

export const setupHttpClient = async (options: SetupHttpClientOptions): Promise<string[]> => {
  const { projectPath, clientType } = options;
  const templatePath = getTemplatePath();
  const installedClients: string[] = [];

  // Copy shared files first
  await copySharedFiles(projectPath);

  // Setup Axios client
  if (clientType === 'axios' || clientType === 'both') {
    const axiosExists = await checkIfClientExists(projectPath, 'axios');

    if (!axiosExists) {
      const axiosTemplatePath = path.join(
        templatePath,
        'src',
        'lib',
        'utils',
        'http',
        'axios-client',
      );
      const axiosProjectPath = path.join(
        projectPath,
        'src',
        'lib',
        'utils',
        'http',
        'axios-client',
      );

      await copyDirectory(axiosTemplatePath, axiosProjectPath);
      installedClients.push('axios');
    }
  }

  // Setup Fetch client
  if (clientType === 'fetch' || clientType === 'both') {
    const fetchExists = await checkIfClientExists(projectPath, 'fetch');

    if (!fetchExists) {
      const fetchTemplatePath = path.join(
        templatePath,
        'src',
        'lib',
        'utils',
        'http',
        'fetch-client',
      );
      const fetchProjectPath = path.join(
        projectPath,
        'src',
        'lib',
        'utils',
        'http',
        'fetch-client',
      );

      await copyDirectory(fetchTemplatePath, fetchProjectPath);
      installedClients.push('fetch');
    }
  }

  // Update index.ts
  await updateHttpIndex(projectPath, clientType);

  return installedClients;
};

export const getRequiredPackages = (clientType: HttpClientType): string[] => {
  const packages: string[] = [];

  if (clientType === 'axios' || clientType === 'both') {
    packages.push('axios');
  }

  return packages;
};
