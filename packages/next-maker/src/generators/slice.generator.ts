import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel, kebabToPascal } from '../config/utils';
import { sliceBarrelTemplate } from './templates/barrel.template';
import { persistTemplate } from './templates/persist.template';
import { selectorsTemplate } from './templates/selectors.template';
import { sliceTemplate } from './templates/slice.template';
import { stateTypesTemplate } from './templates/types.template';
import { zustandSliceTemplate } from './templates/zustand-slice.template';
import type { SliceGeneratorOptions } from './types';

/**
 * Generate a store slice for the project's state library.
 *
 * Redux: slice + selectors + optional `definePersistence` entry + barrel.
 * Zustand: a slice creator to compose into `src/store/index.ts`.
 *
 * Used by the `slice` command (standalone under `src/store/slices/<name>/`)
 * and by the `feature` command (embedded in `features/<name>/store/`); the
 * `typesImportPath` decides where the state type is imported from.
 */
export const generateSlice = async (
  options: SliceGeneratorOptions & { typesImportPath?: string },
): Promise<void> => {
  const {
    name,
    outputPath,
    persist,
    state = 'redux',
    typesImportPath = `./${name}.types`,
  } = options;

  await mkdir(outputPath, { recursive: true });

  const componentName = kebabToPascal(name);
  const camelName = kebabToCamel(name);
  const writes: Promise<void>[] = [];

  if (typesImportPath === `./${name}.types`) {
    writes.push(
      writeFile(
        path.join(outputPath, `${name}.types.ts`),
        stateTypesTemplate({ componentName, withStore: true }),
      ),
    );
  }

  if (state === 'zustand') {
    writes.push(
      writeFile(
        path.join(outputPath, `${name}.store.ts`),
        zustandSliceTemplate({ componentName, camelName, typesImportPath }),
      ),
      writeFile(
        path.join(outputPath, 'index.ts'),
        sliceBarrelTemplate({ sliceName: name, withPersist: false, state }),
      ),
    );
  } else {
    writes.push(
      writeFile(
        path.join(outputPath, `${name}.slice.ts`),
        sliceTemplate({ componentName, camelName, typesImportPath }),
      ),
      writeFile(
        path.join(outputPath, `${name}.selectors.ts`),
        selectorsTemplate({ componentName, camelName, sliceName: name }),
      ),
      writeFile(
        path.join(outputPath, 'index.ts'),
        sliceBarrelTemplate({ sliceName: name, withPersist: persist, state }),
      ),
    );
    if (persist) {
      writes.push(
        writeFile(
          path.join(outputPath, 'persist.ts'),
          persistTemplate({ componentName, camelName, typesImportPath }),
        ),
      );
    }
  }

  await Promise.all(writes);
};
