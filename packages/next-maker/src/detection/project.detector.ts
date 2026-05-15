import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectDetection {
  hasRedux: boolean;
  httpClient: 'axios' | 'fetch' | 'both' | 'none';
  hasI18n: boolean;
  hasTests: boolean;
  /**
   * `'present'` when both the `socket.io-client` dependency and the
   * `src/lib/utils/ws/` directory exist. The dual signal mirrors httpClient
   * — a stray dep without the directory (or vice-versa) is reported as
   * `'none'` so doctor's "is this feature installed?" check stays honest.
   */
  ws: 'none' | 'present';
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

    // WS: both dep + directory must be present. A lone dep without the
    // ws/ subtree means it was installed by something else (or a half-rolled
    // install); a lone directory means the user is mid-migration. Either
    // half-state is reported as 'none' so setup/doctor/remove behave
    // predictably.
    let ws: ProjectDetection['ws'] = 'none';
    if (dependencies['socket.io-client']) {
      try {
        await access(path.join(projectPath, 'src', 'lib', 'utils', 'ws'));
        ws = 'present';
      } catch {
        /* dep present but no ws/ — treat as not installed */
      }
    }

    return { hasRedux, httpClient, hasI18n, hasTests, ws };
  } catch (error) {
    throw new Error(`Failed to detect project setup: ${error}`, { cause: error });
  }
};
