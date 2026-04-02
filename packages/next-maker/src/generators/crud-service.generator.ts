import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../config/utils';
import { crudServiceTemplate } from './templates/crud-service.template';
import type { ServiceGeneratorOptions } from './types';

/**
 * Generate a CRUD API service file with getAll, getById, create, update, delete methods + DTO types.
 */
export const generateCrudService = async (options: ServiceGeneratorOptions): Promise<void> => {
  const { name, outputPath, httpClient } = options;
  const camelName = kebabToCamel(name);
  const pascalName = kebabToPascal(name);

  await writeFile(
    path.join(outputPath, `${name}.service.ts`),
    crudServiceTemplate({ camelName, pascalName, httpClient }),
  );
};
