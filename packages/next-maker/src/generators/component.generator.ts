import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import {
  sharedComponentTemplate,
  componentBarrelTemplate,
} from './templates/shared-component.template';
import { fileExists, readFile, writeFile as writeFileCore } from '../core/files';

export interface ComponentGeneratorOptions {
  name: string;
  projectPath: string;
  isClient: boolean;
  hasI18n: boolean;
  featurePath?: string;
}

export const generateComponent = async (options: ComponentGeneratorOptions): Promise<void> => {
  const { name, projectPath, isClient, hasI18n, featurePath } = options;
  const componentName = kebabToPascal(name);

  if (featurePath) {
    await generateFeatureComponent(componentName, projectPath, featurePath, isClient, hasI18n);
  } else {
    await generateSharedComponent(componentName, name, projectPath, isClient, hasI18n);
  }
};

const generateFeatureComponent = async (
  componentName: string,
  projectPath: string,
  featurePath: string,
  isClient: boolean,
  hasI18n: boolean,
): Promise<void> => {
  const componentsDir = path.join(projectPath, featurePath, 'components');
  await mkdir(componentsDir, { recursive: true });

  await writeFile(
    path.join(componentsDir, `${componentName}.tsx`),
    sharedComponentTemplate({ componentName, isClient, hasI18n }),
  );
};

const generateSharedComponent = async (
  componentName: string,
  kebabName: string,
  projectPath: string,
  isClient: boolean,
  hasI18n: boolean,
): Promise<void> => {
  const componentDir = path.join(projectPath, 'src', 'components', 'common', componentName);
  await mkdir(componentDir, { recursive: true });

  // Generate component file
  await writeFile(
    path.join(componentDir, `${componentName}.tsx`),
    sharedComponentTemplate({ componentName, isClient, hasI18n }),
  );

  // Generate folder barrel (ComponentName/index.ts)
  await writeFile(path.join(componentDir, 'index.ts'), componentBarrelTemplate({ componentName }));

  // Append to common/index.ts
  const commonIndexPath = path.join(projectPath, 'src', 'components', 'common', 'index.ts');
  await appendExport(commonIndexPath, `export { ${componentName} } from './${componentName}';\n`);

  // Append to components/index.ts
  const rootIndexPath = path.join(projectPath, 'src', 'components', 'index.ts');
  await ensureCommonReExport(rootIndexPath);
};

const appendExport = async (filePath: string, exportLine: string): Promise<void> => {
  let content = '';
  if (fileExists(filePath)) {
    content = await readFile(filePath);
  }
  if (!content.includes(exportLine.trim())) {
    content += exportLine;
    await writeFileCore(filePath, content);
  }
};

const ensureCommonReExport = async (filePath: string): Promise<void> => {
  let content = '';
  if (fileExists(filePath)) {
    content = await readFile(filePath);
  }
  const commonExport = "export * from './common';\n";
  if (!content.includes(commonExport.trim())) {
    content += commonExport;
    await writeFileCore(filePath, content);
  }
};
