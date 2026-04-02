import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../config/utils';
import { sliceTemplate } from './templates/slice.template';
import { selectorsTemplate } from './templates/selectors.template';
import { persistTemplate } from './templates/persist.template';
import { stateTypesTemplate } from './templates/types.template';
import { sliceBarrelTemplate } from './templates/barrel.template';
import type { SliceGeneratorOptions } from './types';

/**
 * Generate a complete Redux slice with types, selectors, optional persist, and barrel export.
 *
 * Used by both the `slice` command (standalone) and the `feature` command (embedded in feature/store/).
 * The `typesImportPath` controls whether types are imported from `../types/` (feature) or `./` (standalone).
 */
export const generateSlice = async (
  options: SliceGeneratorOptions & { typesImportPath?: string },
): Promise<void> => {
  const { name, outputPath, persist, typesImportPath = `./${name}.types` } = options;

  await mkdir(outputPath, { recursive: true });

  const componentName = kebabToPascal(name);
  const camelName = kebabToCamel(name);

  await Promise.all([
    writeFile(
      path.join(outputPath, `${name}.types.ts`),
      stateTypesTemplate({ componentName, withStore: true }),
    ),
    writeFile(
      path.join(outputPath, `${name}.slice.ts`),
      sliceTemplate({ componentName, camelName, typesImportPath }),
    ),
    writeFile(
      path.join(outputPath, `${name}.selectors.ts`),
      selectorsTemplate({ componentName, camelName, sliceName: name }),
    ),
    ...(persist
      ? [
          writeFile(
            path.join(outputPath, 'persist.ts'),
            persistTemplate({ componentName, camelName, typesImportPath }),
          ),
        ]
      : []),
    writeFile(
      path.join(outputPath, 'index.ts'),
      sliceBarrelTemplate({ sliceName: name, withPersist: persist }),
    ),
  ]);
};
