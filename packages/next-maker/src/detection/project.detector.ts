import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectDetection {
  hasRedux: boolean;
  httpClient: 'axios' | 'fetch' | 'both' | 'none';
  hasI18n: boolean;
  hasTests: boolean;
}

export const detectProjectSetup = async (projectPath: string): Promise<ProjectDetection> => {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const hasRedux = !!(dependencies['@reduxjs/toolkit'] && dependencies['react-redux']);
    const hasI18n = !!dependencies['next-intl'];

    // Check for HTTP clients: must be both in dependencies AND have client directory
    let hasAxios = !!dependencies.axios;
    let hasFetch = false;

    const axiosClientPath = path.join(projectPath, 'src', 'lib', 'utils', 'http', 'axios-client');
    try {
      await access(axiosClientPath);
    } catch {
      hasAxios = false;
    }

    const fetchClientPath = path.join(projectPath, 'src', 'lib', 'utils', 'http', 'fetch-client');
    try {
      await access(fetchClientPath);
      hasFetch = true;
    } catch {
      hasFetch = false;
    }

    let httpClient: ProjectDetection['httpClient'];
    if (hasAxios && hasFetch) {
      httpClient = 'both';
    } else if (hasAxios) {
      httpClient = 'axios';
    } else if (hasFetch) {
      httpClient = 'fetch';
    } else {
      httpClient = 'none';
    }

    let hasTests = !!dependencies.vitest;
    if (!hasTests) {
      try {
        await access(path.join(projectPath, 'vitest.config.ts'));
        hasTests = true;
      } catch {
        /* no vitest config */
      }
    }

    return { hasRedux, httpClient, hasI18n, hasTests };
  } catch (error) {
    throw new Error(`Failed to detect project setup: ${error}`, { cause: error });
  }
};
