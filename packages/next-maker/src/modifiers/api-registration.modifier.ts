import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../config/utils';
import { addToAppApis } from './helpers';
import type { RegisterApiOptions } from './types';

/**
 * Register API endpoints for a service in app-apis.ts.
 */
export const registerApiEndpoints = async (options: RegisterApiOptions): Promise<void> => {
  const { serviceName, projectPath } = options;
  const camelName = kebabToCamel(serviceName);
  const apiConfigPath = path.join(projectPath, 'src', 'lib', 'config', 'app-apis.ts');

  try {
    let content = await readFile(apiConfigPath, 'utf-8');

    // Skip if already registered
    if (content.includes(`${camelName}:`)) {
      return;
    }

    // Validate AppApis object exists
    if (!content.match(/export const AppApis = \{[\s\S]*?\} as const;/)) {
      throw new Error('Could not find AppApis object in app-apis.ts');
    }

    const newEndpoint = `  ${camelName}: {
    base: \`\${API_PREFIX}/${serviceName}\`,
    getAll: \`\${API_PREFIX}/${serviceName}\`,
  },`;

    content = addToAppApis(content, newEndpoint);
    await writeFile(apiConfigPath, content);
  } catch (error) {
    throw new Error(`Failed to register API endpoints: ${error}`, { cause: error });
  }
};
