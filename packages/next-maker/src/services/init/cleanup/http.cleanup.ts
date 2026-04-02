import path from 'node:path';
import { deleteDirectory, deleteFile, fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import { cleanupHttpTypes } from '../../setup/http-client/injectors';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupHttpClient = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const httpUtilsPath = path.join(projectPath, PROJECT_PATHS.HTTP_UTILS);
  const keepSecureStorage = answers.httpClient !== 'none' || !!answers.reactSecureStorage;

  if (answers.httpClient === 'none') {
    await cleanupNoHttpClient(projectPath, httpUtilsPath, keepSecureStorage);
  } else if (answers.httpClient === 'axios') {
    await cleanupFetchClient(projectPath, httpUtilsPath);
  } else if (answers.httpClient === 'fetch') {
    await cleanupAxiosClient(projectPath, httpUtilsPath);
  }
};

const cleanupNoHttpClient = async (
  projectPath: string,
  httpUtilsPath: string,
  keepSecureStorage: boolean,
): Promise<void> => {
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT));

  if (keepSecureStorage) {
    await writeFile(path.join(httpUtilsPath, 'index.ts'), "export * from './token-store';\n");
    await deleteFile(path.join(projectPath, PROJECT_PATHS.CLIENT_UTILS));
    await cleanupHttpTypes(projectPath, []);
  } else {
    await deleteDirectory(httpUtilsPath);
    await removeHttpExports(projectPath);
    await deleteFile(path.join(projectPath, PROJECT_PATHS.APP_APIS));
    await removeAppApisExport(projectPath);
  }

  await removeApiConstants(projectPath);
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.ERRORS_DIR));

  if (!keepSecureStorage) {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.COMMON_TYPES_DIR));
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.UTILITY_TYPES_DIR));
    await removeTypesExports(projectPath);
  }
};

const cleanupFetchClient = async (projectPath: string, httpUtilsPath: string): Promise<void> => {
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT));
  let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
  content = content.replace(/export .* from '\.\/fetch-client';\n/g, '');
  await writeFile(path.join(httpUtilsPath, 'index.ts'), content);

  const httpTypesPath = path.join(projectPath, PROJECT_PATHS.HTTP_TYPES);
  if (fileExists(httpTypesPath)) {
    let typesContent = await readFile(httpTypesPath);
    typesContent = typesContent.replace(/export interface FetchClientOptions \{[\s\S]*?\}\n\n/, '');
    typesContent = typesContent.replace(
      /export interface ExtendedRequestInit extends RequestInit \{[\s\S]*?\}\n\n/,
      '',
    );
    await writeFile(httpTypesPath, typesContent);
  }
};

const cleanupAxiosClient = async (projectPath: string, httpUtilsPath: string): Promise<void> => {
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT));
  let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
  content = content.replace(/export .* from '\.\/axios-client';\n/g, '');
  await writeFile(path.join(httpUtilsPath, 'index.ts'), content);

  await cleanupHttpTypes(projectPath, ['fetch']);

  const httpTypesPath = path.join(projectPath, PROJECT_PATHS.HTTP_TYPES);
  if (fileExists(httpTypesPath)) {
    let typesContent = await readFile(httpTypesPath);
    typesContent = typesContent.replace(/export interface AxiosClientOptions \{[\s\S]*?\}\n\n/, '');
    await writeFile(httpTypesPath, typesContent);
  }
};

const removeHttpExports = async (projectPath: string): Promise<void> => {
  const utilsIndexPath = path.join(projectPath, PROJECT_PATHS.UTILS_INDEX);
  if (fileExists(utilsIndexPath)) {
    let content = await readFile(utilsIndexPath);
    content = content.replace(/export \* from '\.\/http';\n/, '');
    await writeFile(utilsIndexPath, content);
  }
};

const removeAppApisExport = async (projectPath: string): Promise<void> => {
  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
  if (fileExists(configIndexPath)) {
    let content = await readFile(configIndexPath);
    content = content.replace(/export \* from '\.\/app-apis';\n/, '');
    await writeFile(configIndexPath, content);
  }
};

const removeApiConstants = async (projectPath: string): Promise<void> => {
  const constantsPath = path.join(projectPath, PROJECT_PATHS.CONSTANTS);
  if (fileExists(constantsPath)) {
    let content = await readFile(constantsPath);
    content = content.replace(/export const API_RESPONSE_DATA_KEY = 'data';\n/, '');
    content = content.replace(/export const SAVE_AUTH_TOKENS = false;\n/, '');
    await writeFile(constantsPath, content);
  }
};

const removeTypesExports = async (projectPath: string): Promise<void> => {
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);
    content = content.replace(/export \* from '\.\/utility';\n/, '');
    content = content.replace(/export \* from '\.\/common';\n/, '');
    await writeFile(typesIndexPath, content);
  }
};
