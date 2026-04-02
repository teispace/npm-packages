import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import { customHookTemplate } from './templates/custom-hook.template';

export interface HookGeneratorOptions {
  name: string;
  projectPath: string;
  isClient: boolean;
  featurePath?: string;
}

export const generateHook = async (options: HookGeneratorOptions): Promise<void> => {
  const { name, projectPath, isClient, featurePath } = options;
  const pascalName = kebabToPascal(name);
  const hookName = `use${pascalName}`;

  let hooksDir: string;
  if (featurePath) {
    hooksDir = path.join(projectPath, featurePath, 'hooks');
  } else {
    hooksDir = path.join(projectPath, 'src', 'hooks');
  }

  await mkdir(hooksDir, { recursive: true });

  await writeFile(
    path.join(hooksDir, `${hookName}.ts`),
    customHookTemplate({ hookName, isClient }),
  );
};
