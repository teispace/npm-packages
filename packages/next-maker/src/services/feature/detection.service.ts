import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectDetection {
  hasRedux: boolean;
  httpClient: 'axios' | 'fetch' | 'both' | 'none';
  hasI18n: boolean;
}

export const detectProjectSetup = async (projectPath: string): Promise<ProjectDetection> => {
  let hasRedux = false;
  let hasAxios = false;
  let hasFetch = false;
  let hasI18n = false;

  try {
    // Read package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for Redux
    hasRedux = !!(dependencies['@reduxjs/toolkit'] && dependencies['react-redux']);

    // Check for axios
    hasAxios = !!dependencies['axios'];

    // Check for i18n
    hasI18n = !!dependencies['next-intl'];

    // Check if axios client exists
    const axiosClientPath = path.join(projectPath, 'src', 'lib', 'utils', 'http', 'axios-client');
    try {
      await access(axiosClientPath);
      hasAxios = hasAxios && true; // Confirm axios is both installed and client exists
    } catch {
      hasAxios = false; // Axios client doesn't exist
    }

    // Check if fetch client exists
    const fetchClientPath = path.join(projectPath, 'src', 'lib', 'utils', 'http', 'fetch-client');
    try {
      await access(fetchClientPath);
      hasFetch = true;
    } catch {
      hasFetch = false; // Fetch client doesn't exist
    }

    // Determine HTTP client setup
    let httpClient: 'axios' | 'fetch' | 'both' | 'none';
    if (hasAxios && hasFetch) {
      httpClient = 'both';
    } else if (hasAxios) {
      httpClient = 'axios';
    } else if (hasFetch) {
      httpClient = 'fetch';
    } else {
      httpClient = 'none';
    }

    return {
      hasRedux,
      httpClient,
      hasI18n,
    };
  } catch (error) {
    throw new Error(`Failed to detect project setup: ${error}`);
  }
};

export const featureExists = async (
  projectPath: string,
  featureName: string,
  basePath: string = path.join('src', 'features'),
): Promise<boolean> => {
  const featurePath = path.join(projectPath, basePath, featureName);
  try {
    await access(featurePath);
    return true;
  } catch {
    return false;
  }
};
