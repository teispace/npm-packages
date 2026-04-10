import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import {
  dynamicPageTemplate,
  errorTemplate,
  loadingTemplate,
  pageTemplate,
} from './templates/page.template';

export interface PageGeneratorOptions {
  name: string;
  projectPath: string;
  hasI18n: boolean;
  dynamic?: string;
  withLoading?: boolean;
  withError?: boolean;
}

export const generatePage = async (options: PageGeneratorOptions): Promise<void> => {
  const { name, projectPath, hasI18n, dynamic, withLoading = false, withError = false } = options;

  const componentName = kebabToPascal(name);
  const routePath = `/${name}`;

  // Determine page directory
  const baseDir = hasI18n ? 'src/app/[locale]' : 'src/app';
  let pageDir: string;

  if (dynamic) {
    pageDir = path.join(projectPath, baseDir, name, `[${dynamic}]`);
  } else {
    pageDir = path.join(projectPath, baseDir, name);
  }

  await mkdir(pageDir, { recursive: true });

  // Generate page file
  const pageContent = dynamic
    ? dynamicPageTemplate({
        componentName,
        routePath: dynamic ? `${routePath}/[${dynamic}]` : routePath,
        paramName: dynamic,
        hasI18n,
      })
    : pageTemplate({ componentName, routePath, hasI18n });

  await writeFile(path.join(pageDir, 'page.tsx'), pageContent);

  if (withLoading) {
    await writeFile(path.join(pageDir, 'loading.tsx'), loadingTemplate({ componentName }));
  }

  if (withError) {
    await writeFile(path.join(pageDir, 'error.tsx'), errorTemplate({ componentName }));
  }
};
