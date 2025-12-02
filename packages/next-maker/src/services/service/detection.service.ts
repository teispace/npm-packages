import { existsSync } from 'node:fs';
import path from 'node:path';

export const serviceExists = async (
  projectPath: string,
  serviceName: string,
  basePath: string,
): Promise<boolean> => {
  const servicePath = path.join(projectPath, basePath, `${serviceName}.service.ts`);
  return existsSync(servicePath);
};
