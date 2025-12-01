import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

export const readFile = async (filePath: string): Promise<string> => {
  return fs.readFile(filePath, 'utf-8');
};

export const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
};

export const deleteFile = async (filePath: string): Promise<void> => {
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
};

export const deleteDirectory = async (dirPath: string): Promise<void> => {
  if (existsSync(dirPath)) {
    await fs.rm(dirPath, { recursive: true, force: true });
  }
};

export const updateJson = async <T = any>(
  filePath: string,
  update: (json: T) => T,
): Promise<void> => {
  const content = await readFile(filePath);
  const json = JSON.parse(content) as T;
  const updatedJson = update(json);
  await writeFile(filePath, JSON.stringify(updatedJson, null, 2));
};

export const fileExists = (filePath: string): boolean => {
  return existsSync(filePath);
};
