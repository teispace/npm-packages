import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToPascal } from '../config/utils';
import { errorTemplate, loadingTemplate, pageTemplate } from './templates/page.template';

export interface PageGeneratorOptions {
  name: string;
  projectPath: string;
  hasI18n: boolean;
  /** Route group to place the page in, e.g. `app` or `marketing` (without parentheses). */
  group?: string;
  dynamic?: string;
  withLoading?: boolean;
  withError?: boolean;
}

export interface PageGeneratorResult {
  pageDir: string;
  routePath: string;
}

export const generatePage = async (options: PageGeneratorOptions): Promise<PageGeneratorResult> => {
  const {
    name,
    projectPath,
    hasI18n,
    group,
    dynamic,
    withLoading = false,
    withError = false,
  } = options;
  const componentName = kebabToPascal(name);
  const routePath = `/${name}`;

  const segments = [projectPath, 'src', 'app'];
  if (hasI18n) segments.push('[locale]');
  if (group) segments.push(`(${group})`);
  segments.push(name);
  if (dynamic) segments.push(`[${dynamic}]`);
  const pageDir = path.join(...segments);
  await mkdir(pageDir, { recursive: true });

  await writeFile(
    path.join(pageDir, 'page.tsx'),
    pageTemplate({ componentName, routePath, hasI18n, paramName: dynamic }),
  );
  if (withLoading) {
    await writeFile(path.join(pageDir, 'loading.tsx'), loadingTemplate({ componentName }));
  }
  if (withError) {
    await writeFile(path.join(pageDir, 'error.tsx'), errorTemplate({ componentName }));
  }
  return { pageDir, routePath: dynamic ? `${routePath}/[${dynamic}]` : routePath };
};
