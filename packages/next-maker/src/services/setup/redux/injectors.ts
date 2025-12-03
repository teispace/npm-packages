import path from 'node:path';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';

export const updateProvidersIndex = async (projectPath: string): Promise<void> => {
  const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
  let providersContent = await readFile(providersIndexPath);
  if (!providersContent.includes('StoreProvider')) {
    providersContent += "export * from './StoreProvider';\n";
    await writeFile(providersIndexPath, providersContent);
  }
};

export const updateRootProvider = async (projectPath: string): Promise<void> => {
  const rootProviderPath = path.join(projectPath, 'src/providers/RootProvider.tsx');
  if (fileExists(rootProviderPath)) {
    let rootProviderContent = await readFile(rootProviderPath);

    // Add import
    if (!rootProviderContent.includes('StoreProvider')) {
      rootProviderContent = rootProviderContent.replace(
        /import \{ (.*?) \} from '@\/providers';/,
        "import { $1, StoreProvider } from '@/providers';",
      );
      // Fallback if regex didn't match (e.g. no named imports yet)
      if (!rootProviderContent.includes('StoreProvider')) {
        if (rootProviderContent.includes("from '@/providers'")) {
          // Try to append to existing import
          rootProviderContent = rootProviderContent.replace(
            /\} from '@\/providers'/,
            ", StoreProvider } from '@/providers'",
          );
        } else {
          rootProviderContent =
            "import { StoreProvider } from '@/providers';\n" + rootProviderContent;
        }
      }
    }

    // Wrap children
    // We want StoreProvider to be the outermost (or close to it)
    if (!rootProviderContent.includes('<StoreProvider>')) {
      const returnMatch = rootProviderContent.match(/return \(\s*([\s\S]*?)\s*\);/);
      if (returnMatch) {
        rootProviderContent = rootProviderContent.replace(
          /return \(\s*<([^>]+)([^>]*)>([\s\S]*)<\/\1>\s*\);/,
          (match, tag, attrs, content) => {
            return `return (\n    <StoreProvider>\n      <${tag}${attrs}>${content}</${tag}>\n    </StoreProvider>\n  );`;
          },
        );
        await writeFile(rootProviderPath, rootProviderContent);
      }
    }
  }
};

export const updatePage = async (projectPath: string): Promise<void> => {
  // Try to find the page file
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

  if (pagePath) {
    let pageContent = await readFile(pagePath);

    // Add import
    if (!pageContent.includes('Counter')) {
      pageContent =
        "import { Counter } from '@/features/counter/components/Counter';\n" + pageContent;
    }

    // Add Component
    if (!pageContent.includes('<Counter />')) {
      // Look for the closing tag of the main container (usually div or main)
      // We'll just append it to the end of the children of the first element
      // This is a bit risky but standard for simple injections
      const lastDivIndex = pageContent.lastIndexOf('</div>');
      const lastMainIndex = pageContent.lastIndexOf('</main>');

      const insertIndex = lastMainIndex !== -1 ? lastMainIndex : lastDivIndex;

      if (insertIndex !== -1) {
        pageContent =
          pageContent.slice(0, insertIndex) +
          '\n      <div className="mt-8">\n        <h2 className="text-2xl font-bold mb-4">Redux Counter</h2>\n        <Counter />\n      </div>\n' +
          pageContent.slice(insertIndex);
        await writeFile(pagePath, pageContent);
      }
    }
  }
};
