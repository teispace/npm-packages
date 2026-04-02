import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Check if a directory exists at projectPath/basePath/name.
 */
export const directoryExists = async (
  projectPath: string,
  name: string,
  basePath: string,
): Promise<boolean> => {
  try {
    await access(path.join(projectPath, basePath, name));
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if a specific file exists at projectPath/basePath/fileName.
 */
export const fileExistsAt = (projectPath: string, basePath: string, fileName: string): boolean => {
  return existsSync(path.join(projectPath, basePath, fileName));
};
