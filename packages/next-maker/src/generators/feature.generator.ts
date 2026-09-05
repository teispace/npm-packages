import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import { generateApi } from './api.generator';
import { generateSlice } from './slice.generator';
import { featureBarrelTemplate, featureServerBarrelTemplate } from './templates/barrel.template';
import { componentTemplate } from './templates/component.template';
import { hookWithoutStoreTemplate, hookWithStoreTemplate } from './templates/hook.template';
import { componentTestTemplate } from './templates/test.template';
import { stateTypesTemplate } from './templates/types.template';
import type { FeatureGeneratorOptions } from './types';

/**
 * Generate a feature module in the v2 shape:
 *
 *   api/{schema,keys,server,queries,actions}.ts   (createApi)
 *   components/<Name>List.tsx (+ test)
 *   hooks/use<Name>.ts                             (when no api: local state hook)
 *   store/                                         (createStore)
 *   types/<name>.types.ts
 *   index.ts (client-safe) + server.ts (server-only)
 */
export const generateFeature = async (options: FeatureGeneratorOptions): Promise<void> => {
  const { name, outputPath, createStore, persistStore, createApi, state, hasI18n, hasTests } =
    options;

  const pascalName = kebabToPascal(name);
  const componentName = createApi ? `${pascalName}List` : pascalName;
  const hookName = `use${pascalName}`;
  const withStore = createStore && state !== 'none';

  await mkdir(path.join(outputPath, 'components'), { recursive: true });
  await mkdir(path.join(outputPath, 'types'), { recursive: true });
  if (!createApi) await mkdir(path.join(outputPath, 'hooks'), { recursive: true });

  const writes: Promise<unknown>[] = [
    writeFile(
      path.join(outputPath, 'components', `${componentName}.tsx`),
      componentTemplate({ componentName, hookName, withApi: createApi, pascalName, hasI18n }),
    ),
    writeFile(
      path.join(outputPath, 'types', `${name}.types.ts`),
      stateTypesTemplate({ componentName: pascalName, withStore }),
    ),
    writeFile(
      path.join(outputPath, 'index.ts'),
      featureBarrelTemplate({
        featureName: name,
        componentName,
        hookName,
        pascalName,
        withStore,
        withApi: createApi,
      }),
    ),
  ];

  if (!createApi) {
    writes.push(
      writeFile(
        path.join(outputPath, 'hooks', `${hookName}.ts`),
        withStore
          ? hookWithStoreTemplate({
              hookName,
              componentName: pascalName,
              featureName: name,
              state: state === 'zustand' ? 'zustand' : 'redux',
            })
          : hookWithoutStoreTemplate({ hookName }),
      ),
    );
  }

  if (createApi) {
    writes.push(generateApi({ name, featurePath: outputPath, withActions: true }));
    writes.push(
      writeFile(path.join(outputPath, 'server.ts'), featureServerBarrelTemplate({ pascalName })),
    );
  }

  if (hasTests) {
    writes.push(
      writeFile(
        path.join(outputPath, 'components', `${componentName}.test.tsx`),
        componentTestTemplate({
          componentName,
          sourceImportPath: `./${componentName}`,
          testUtilsImportPath: '../../../../test/test-utils',
          hasState: state !== 'none',
          hasI18n,
          withQueryData: createApi
            ? { keysImport: `../api/keys`, keys: `${kebab2camel(name)}Keys`, key: 'list' }
            : undefined,
        }),
      ),
    );
  }

  await Promise.all(writes);

  if (withStore) {
    await generateSlice({
      name,
      outputPath: path.join(outputPath, 'store'),
      persist: persistStore,
      state: state === 'zustand' ? 'zustand' : 'redux',
      typesImportPath: `../types/${name}.types`,
    });
  }
};

const kebab2camel = (kebab: string): string =>
  kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
