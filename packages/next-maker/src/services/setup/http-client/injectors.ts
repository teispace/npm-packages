import path from 'node:path';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';

export const updateHttpIndex = async (
  projectPath: string,
  clientType: 'fetch' | 'axios',
): Promise<void> => {
  const httpIndexPath = path.join(projectPath, PROJECT_PATHS.HTTP_UTILS, 'index.ts');
  if (fileExists(httpIndexPath)) {
    let content = await readFile(httpIndexPath);

    if (clientType === 'fetch') {
      content = content.replace(/export .* from '\.\/axios-client';\n?/g, '');
      if (!content.includes('fetch-client')) {
        content += "export * from './fetch-client';\n";
      }
    } else {
      content = content.replace(/export .* from '\.\/fetch-client';\n?/g, '');
      if (!content.includes('axios-client')) {
        content += "export * from './axios-client';\n";
      }
    }

    await writeFile(httpIndexPath, content);
  }
};

export const updateHttpTypes = async (
  projectPath: string,
  clientType: 'fetch' | 'axios',
): Promise<void> => {
  const httpTypesPath = path.join(projectPath, PROJECT_PATHS.HTTP_TYPES);
  if (fileExists(httpTypesPath)) {
    let content = await readFile(httpTypesPath);

    if (clientType === 'fetch') {
      // Remove Axios stuff
      content = content.replace(/declare module 'axios' \{[\s\S]*?\}\n\n?/g, '');
      content = content.replace(/export interface AxiosClientOptions \{[\s\S]*?\}\n\n?/g, '');
    } else {
      // Remove Fetch stuff
      content = content.replace(/export interface FetchClientOptions \{[\s\S]*?\}\n\n?/g, '');
      content = content.replace(
        /export interface ExtendedRequestInit extends RequestInit \{[\s\S]*?\}\n\n?/g,
        '',
      );
    }

    await writeFile(httpTypesPath, content);
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
