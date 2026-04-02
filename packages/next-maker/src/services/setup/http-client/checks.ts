import path from 'node:path';
import { fileExists } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';

export type HttpClientType = 'fetch' | 'axios' | 'none' | 'both';

export interface HttpClientSetupStatus {
  status: HttpClientType;
  reason?: string;
}

export const checkIsAlreadySetup = async (projectPath: string): Promise<HttpClientSetupStatus> => {
  const fetchClientPath = path.join(projectPath, PROJECT_PATHS.FETCH_CLIENT_FILE);
  const axiosClientPath = path.join(projectPath, PROJECT_PATHS.AXIOS_CLIENT_FILE);

  const hasFetch = fileExists(fetchClientPath);
  const hasAxios = fileExists(axiosClientPath);

  if (hasFetch && hasAxios) {
    return { status: 'both', reason: 'Both Fetch and Axios clients are detected' };
  }

  if (hasFetch) {
    return { status: 'fetch', reason: 'Fetch client is already setup' };
  }

  if (hasAxios) {
    return { status: 'axios', reason: 'Axios client is already setup' };
  }

  return { status: 'none' };
};

export const validateProjectStructure = async (projectPath: string): Promise<void> => {
  const requiredPaths = [
    path.join(projectPath, 'src/lib'),
    path.join(projectPath, 'src/types'),
    path.join(projectPath, 'src/lib/config'),
  ];

  const missingPaths = requiredPaths.filter((p) => !fileExists(p));

  if (missingPaths.length > 0) {
    throw new Error(
      `Invalid project structure. Missing directories:\n${missingPaths.map((p) => `- ${p}`).join('\n')}`,
    );
  }
};
