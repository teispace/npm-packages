import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../config/utils';
import { addToAppApis } from './helpers';
import { crudApiConfigTemplate } from '../generators/templates/crud-service.template';

/**
 * Register CRUD API endpoints for a service in app-apis.ts.
 */
export const registerCrudApiEndpoints = async (
  projectPath: string,
  serviceName: string,
): Promise<void> => {
  const camelName = kebabToCamel(serviceName);
  const apiConfigPath = path.join(projectPath, 'src', 'lib', 'config', 'app-apis.ts');

  try {
    let content = await readFile(apiConfigPath, 'utf-8');

    if (content.includes(`${camelName}:`)) return;

    if (!content.match(/export const AppApis = \{[\s\S]*?\} as const;/)) {
      throw new Error('Could not find AppApis object in app-apis.ts');
    }

    const newEndpoint = crudApiConfigTemplate({ camelName, kebabName: serviceName });
    content = addToAppApis(content, newEndpoint);
    await writeFile(apiConfigPath, content);
  } catch (error) {
    throw new Error(`Failed to register CRUD API endpoints: ${error}`, { cause: error });
  }
};
