import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile, writeFile } from '../../../core/files';

export const updateProvidersIndex = async (_projectPath: string): Promise<void> => {
  // StoreProvider is intentionally NOT exported from `@/providers` in the current
  // template — RootProvider imports it via a relative path. Nothing to do here.
  return;
};

export const updateRootProvider = async (projectPath: string): Promise<void> => {
  const rootProviderPath = path.join(projectPath, 'src/providers/RootProvider.tsx');
  if (!fileExists(rootProviderPath)) return;

  let content = await readFile(rootProviderPath);

  const useClientDirective = "'use client';";
  const hasUseClient = content.includes(useClientDirective);
  if (hasUseClient) {
    content = content.replace(useClientDirective, '').trim();
  }

  // Ensure AppState + StoreProvider imports exist
  if (!content.includes("from '@/store'")) {
    content = `import type { AppState } from '@/store';\n${content}`;
  }
  if (!content.includes("from './StoreProvider'")) {
    content = `${content.includes("from '@/store'") ? '' : ''}import { StoreProvider } from './StoreProvider';\n${content}`;
  }

  if (hasUseClient) {
    content = `${useClientDirective}\n${content}`;
  }

  // Add preloadedState to props (both the type and the destructured args)
  if (!content.includes('preloadedState')) {
    content = content.replace(
      /children:\s*React\.ReactNode;/,
      'children: React.ReactNode;\n  preloadedState?: Partial<AppState>;',
    );
    // Add to destructuring
    content = content.replace(
      /export const RootProvider = \(\{([\s\S]*?)\}:/,
      (_m, inner) => `export const RootProvider = ({${inner}, preloadedState }:`,
    );
    // Clean up duplicate commas that may arise
    content = content
      .replace(/,\s*,/g, ',')
      .replace(/\{\s*,/g, '{ ')
      .replace(/,\s*\}/g, ' }');
  }

  // Wrap the existing return JSX with StoreProvider
  if (!content.includes('<StoreProvider')) {
    const returnMatch = content.match(/return\s*\(\s*([\s\S]*?)\s*\);/);
    if (returnMatch) {
      const existingJsx = returnMatch[1];
      content = content.replace(
        returnMatch[0],
        `return (\n    <StoreProvider preloadedState={preloadedState}>\n      ${existingJsx}\n    </StoreProvider>\n  );`,
      );
    }
  }

  await writeFile(rootProviderPath, content);
};

export const updatePage = async (projectPath: string): Promise<void> => {
  const possiblePagePaths = [
    path.join(projectPath, PROJECT_PATHS.ROOT_PAGE),
    path.join(projectPath, 'src/app/[locale]/page.tsx'),
  ];

  let pagePath = '';
  for (const p of possiblePagePaths) {
    if (fileExists(p)) {
      pagePath = p;
      break;
    }
  }
  if (!pagePath) return;

  let pageContent = await readFile(pagePath);

  if (!pageContent.includes('Counter')) {
    pageContent = `import { Counter } from '@/features/counter';\n${pageContent}`;
  }

  if (!pageContent.includes('<Counter />')) {
    const lastDivIndex = pageContent.lastIndexOf('</div>');
    const lastMainIndex = pageContent.lastIndexOf('</main>');
    const insertIndex = lastMainIndex !== -1 ? lastMainIndex : lastDivIndex;

    if (insertIndex !== -1) {
      pageContent =
        pageContent.slice(0, insertIndex) +
        '\n      <div className="mt-8">\n        <h2 className="mb-4 text-2xl font-bold">Redux Counter</h2>\n        <Counter />\n      </div>\n' +
        pageContent.slice(insertIndex);
      await writeFile(pagePath, pageContent);
    }
  }
};
