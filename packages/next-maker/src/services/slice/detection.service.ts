import { access } from 'node:fs/promises';
import path from 'node:path';

export const sliceExists = async (
  projectPath: string,
  sliceName: string,
  basePath: string = path.join('src', 'store', 'slices'),
): Promise<boolean> => {
  const slicePath = path.join(projectPath, basePath, sliceName);
  try {
    await access(slicePath);
    return true;
  } catch {
    return false;
  }
};
