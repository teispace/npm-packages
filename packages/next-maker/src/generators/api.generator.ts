import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../config/utils';
import {
  type ApiTemplateParams,
  apiActionsTemplate,
  apiKeysTemplate,
  apiQueriesTemplate,
  apiSchemaTemplate,
  apiServerTemplate,
} from './templates/api.template';
import type { ApiGeneratorOptions } from './types';

/** Emit the feature's `api/` folder: schema, keys, server (DAL), queries, and optionally actions. */
export const generateApi = async (options: ApiGeneratorOptions): Promise<string[]> => {
  const { name, featurePath, withActions } = options;
  const params: ApiTemplateParams = {
    kebabName: name,
    camelName: kebabToCamel(name),
    pascalName: kebabToPascal(name),
  };
  const apiDir = path.join(featurePath, 'api');
  await mkdir(apiDir, { recursive: true });

  const files: [string, string][] = [
    ['schema.ts', apiSchemaTemplate(params)],
    ['keys.ts', apiKeysTemplate(params)],
    ['server.ts', apiServerTemplate(params)],
    ['queries.ts', apiQueriesTemplate(params)],
  ];
  if (withActions) files.push(['actions.ts', apiActionsTemplate(params)]);

  await Promise.all(files.map(([file, content]) => writeFile(path.join(apiDir, file), content)));
  return files.map(([file]) => path.join('api', file));
};
