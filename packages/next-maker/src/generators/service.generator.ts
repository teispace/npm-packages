import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../config/utils';
import { serviceTemplate } from './templates/service.template';
import type { ServiceGeneratorOptions } from './types';

/**
 * Generate an API service file for the given HTTP client.
 */
export const generateService = async (options: ServiceGeneratorOptions): Promise<void> => {
  const { name, outputPath, httpClient } = options;
  const camelName = kebabToCamel(name);

  await writeFile(
    path.join(outputPath, `${name}.service.ts`),
    serviceTemplate({ camelName, httpClient }),
  );
};
