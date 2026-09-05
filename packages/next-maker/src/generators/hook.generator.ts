import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import { hookWithoutStoreTemplate } from './templates/hook.template';

export interface HookGeneratorOptions {
  name: string;
  projectPath: string;
  isClient: boolean;
  featurePath?: string;
}

export const generateHook = async (options: HookGeneratorOptions): Promise<void> => {
  const { name, projectPath, featurePath } = options;
  const hookName = `use${kebabToPascal(name)}`;
  const hooksDir = featurePath
    ? path.join(projectPath, featurePath, 'hooks')
    : path.join(projectPath, 'src', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  await writeFile(path.join(hooksDir, `${hookName}.ts`), hookWithoutStoreTemplate({ hookName }));
};
