import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile } from '../../../core/files';

export const findLayoutPath = async (projectPath: string): Promise<string> => {
  const possibleLayoutPaths = [
    path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT),
    path.join(projectPath, 'src/app/[locale]/layout.tsx'),
  ];

  for (const p of possibleLayoutPaths) {
    if (fileExists(p)) {
      const content = await readFile(p);
      if (content.includes('<body')) {
        return p;
      }
    }
  }

  // Fallback: if no body tag found, just take the first one that exists
  for (const p of possibleLayoutPaths) {
    if (fileExists(p)) {
      return p;
    }
  }

  return '';
};
