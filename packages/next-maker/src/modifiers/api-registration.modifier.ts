import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../config/utils';
import { apiEndpointsTemplate } from '../generators/templates/api.template';
import { addToAppApis } from './helpers';
import type { RegisterApiOptions } from './types';

/** Register a feature's endpoints (list, detail, create, update, delete) in `app-apis.ts`. */
export const registerApiEndpoints = async (options: RegisterApiOptions): Promise<void> => {
  const { serviceName, projectPath } = options;
  const camelName = kebabToCamel(serviceName);
  const apiConfigPath = path.join(projectPath, 'src', 'lib', 'config', 'app-apis.ts');

  try {
    let content = await readFile(apiConfigPath, 'utf-8');
    if (content.includes(`${camelName}:`)) return;
    if (!content.match(/export const AppApis = \{[\s\S]*?\} as const;/)) {
      throw new Error('Could not find AppApis object in app-apis.ts');
    }
    content = addToAppApis(
      content,
      apiEndpointsTemplate({
        kebabName: serviceName,
        camelName,
        pascalName: kebabToPascal(serviceName),
      }),
    );
    await writeFile(apiConfigPath, content);
  } catch (error) {
    throw new Error(`Failed to register API endpoints: ${error}`, { cause: error });
  }
};
