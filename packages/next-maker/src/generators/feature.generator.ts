import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import { componentTemplate } from './templates/component.template';
import { hookWithStoreTemplate, hookWithoutStoreTemplate } from './templates/hook.template';
import { stateTypesTemplate } from './templates/types.template';
import { featureBarrelTemplate } from './templates/barrel.template';
import { generateSlice } from './slice.generator';
import { generateService } from './service.generator';
import type { FeatureGeneratorOptions } from './types';

/**
 * Generate a complete feature module with component, hook, types,
 * and optionally store (slice) and service sub-modules.
 */
export const generateFeature = async (options: FeatureGeneratorOptions): Promise<void> => {
  const { name, outputPath, createStore, persistStore, createService, httpClient } = options;

  const componentName = kebabToPascal(name);
  const hookName = `use${componentName}`;

  // Create directories
  const dirs = [
    path.join(outputPath, 'components'),
    path.join(outputPath, 'hooks'),
    path.join(outputPath, 'types'),
    ...(createStore ? [path.join(outputPath, 'store')] : []),
    ...(createService ? [path.join(outputPath, 'services')] : []),
  ];
  await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));

  // Generate base files
  await Promise.all([
    writeFile(
      path.join(outputPath, 'components', `${componentName}.tsx`),
      componentTemplate({ componentName, hookName }),
    ),
    writeFile(
      path.join(outputPath, 'hooks', `${hookName}.ts`),
      createStore
        ? hookWithStoreTemplate({ hookName, componentName, featureName: name })
        : hookWithoutStoreTemplate({ hookName }),
    ),
    writeFile(
      path.join(outputPath, 'types', `${name}.types.ts`),
      stateTypesTemplate({ componentName, withStore: createStore }),
    ),
    writeFile(
      path.join(outputPath, 'index.ts'),
      featureBarrelTemplate({
        featureName: name,
        componentName,
        hookName,
        withStore: createStore,
        withService: createService,
      }),
    ),
  ]);

  // Generate store (slice) if requested — types import from ../types/
  if (createStore) {
    await generateSlice({
      name,
      outputPath: path.join(outputPath, 'store'),
      persist: persistStore,
      typesImportPath: `../types/${name}.types`,
    });
  }

  // Generate service if requested
  if (createService && httpClient) {
    await generateService({
      name,
      outputPath: path.join(outputPath, 'services'),
      httpClient,
    });
  }
};
