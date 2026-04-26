import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_PATHS } from '../config/paths';
import { kebabToPascal } from '../config/utils';
import { fileExists, writeFile } from '../core/files';
import { providerComponentName, providerTemplate } from './templates/provider.template';

export interface ProviderGeneratorOptions {
  /** Kebab-case or PascalCase base name (e.g. `auth` or `Auth`). */
  name: string;
  projectPath: string;
}

export interface ProviderGeneratorResult {
  componentName: string;
  /** Filename without extension, e.g. `AuthProvider`. */
  fileBaseName: string;
  /** Absolute path to the generated provider file. */
  providerFile: string;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9-]*$/;

const toPascal = (name: string): string =>
  name.includes('-') ? kebabToPascal(name) : name.charAt(0).toUpperCase() + name.slice(1);

export const generateProvider = async (
  options: ProviderGeneratorOptions,
): Promise<ProviderGeneratorResult> => {
  const { name, projectPath } = options;

  if (!NAME_RE.test(name)) {
    throw new Error(
      `Invalid provider name "${name}". Use kebab-case or PascalCase letters and digits only.`,
    );
  }

  const baseName = toPascal(name).replace(/Provider$/, '');
  const componentName = providerComponentName(baseName);
  const fileBaseName = componentName;

  const providerDir = path.join(projectPath, PROJECT_PATHS.PROVIDERS);
  const providerFile = path.join(providerDir, `${fileBaseName}.tsx`);

  if (fileExists(providerFile)) {
    throw new Error(`Provider already exists at ${path.relative(projectPath, providerFile)}.`);
  }

  await mkdir(providerDir, { recursive: true });
  await writeFile(providerFile, providerTemplate({ baseName }));

  return { componentName, fileBaseName, providerFile };
};
