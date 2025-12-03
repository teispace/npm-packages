import path from 'node:path';
import { fileExists, readFile, writeFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';

export const updateProvidersIndex = async (projectPath: string): Promise<void> => {
  const providersIndexPath = path.join(projectPath, PROJECT_PATHS.PROVIDERS_INDEX);
  let providersContent = await readFile(providersIndexPath);
  if (!providersContent.includes('CustomThemeProvider')) {
    providersContent += "export * from './CustomThemeProvider';\n";
    await writeFile(providersIndexPath, providersContent);
  }
};

export const updateRootProvider = async (projectPath: string): Promise<void> => {
  const rootProviderPath = path.join(projectPath, 'src/providers/RootProvider.tsx');
  if (fileExists(rootProviderPath)) {
    let rootProviderContent = await readFile(rootProviderPath);

    // Handle 'use client'
    const useClientDirective = "'use client';";
    const hasUseClient = rootProviderContent.includes(useClientDirective);

    if (hasUseClient) {
      rootProviderContent = rootProviderContent.replace(useClientDirective, '').trim();
    }

    // Add import if missing
    if (!rootProviderContent.includes('CustomThemeProvider')) {
      rootProviderContent = rootProviderContent.replace(
        /import \{ StoreProvider \} from '@\/providers';\n/,
        "import { StoreProvider, CustomThemeProvider } from '@/providers';\n",
      );
      // Fallback if StoreProvider import is different or missing
      if (!rootProviderContent.includes('CustomThemeProvider')) {
        if (rootProviderContent.includes("from '@/providers'")) {
          rootProviderContent = rootProviderContent.replace(
            /\} from '@\/providers'/,
            ", CustomThemeProvider } from '@/providers'",
          );
        } else {
          rootProviderContent =
            "import { CustomThemeProvider } from '@/providers';\n" + rootProviderContent;
        }
      }
    }

    // Re-add 'use client' at the top
    if (hasUseClient) {
      rootProviderContent = useClientDirective + '\n' + rootProviderContent;
    }

    // Wrap children
    if (!rootProviderContent.includes('<CustomThemeProvider>')) {
      if (rootProviderContent.includes('<StoreProvider>')) {
        rootProviderContent = rootProviderContent.replace(
          /<StoreProvider>/,
          '<StoreProvider>\n      <CustomThemeProvider>',
        );
        rootProviderContent = rootProviderContent.replace(
          /<\/StoreProvider>/,
          '</CustomThemeProvider>\n    </StoreProvider>',
        );
      } else {
        // Match return statement with or without parentheses
        const returnMatch = rootProviderContent.match(/return\s*(?:\(\s*)?([\s\S]*?)(?:\s*\))?;/);
        if (returnMatch) {
          const existingJsx = returnMatch[1];
          rootProviderContent = rootProviderContent.replace(
            returnMatch[0],
            `return (\n    <CustomThemeProvider>\n      ${existingJsx}\n    </CustomThemeProvider>\n  );`,
          );
        }
      }
      await writeFile(rootProviderPath, rootProviderContent);
    }
  }
};

export const updateGlobalsCss = async (projectPath: string, tempDir: string): Promise<void> => {
  const globalsCssPath = path.join(projectPath, PROJECT_PATHS.GLOBALS_CSS);
  const sourceCssPath = path.join(tempDir, 'src/styles/globals.css');
  let darkThemeCss = '';

  if (fileExists(sourceCssPath)) {
    const sourceCss = await readFile(sourceCssPath);
    const variantMatch = sourceCss.match(/@custom-variant dark \(.*?\);/);
    const themeMatch = sourceCss.match(/@theme \{[\s\S]*?\}/);

    if (variantMatch) darkThemeCss += `\n${variantMatch[0]}\n`;
    if (themeMatch) darkThemeCss += `\n${themeMatch[0]}\n`;
  }

  if (!darkThemeCss) {
    darkThemeCss = `
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-dark: #202938;
  --color-light: #f5f5f5;
}
`;
  }

  let cssContent = await readFile(globalsCssPath);
  if (!cssContent.includes('@custom-variant dark')) {
    if (cssContent.includes('@import')) {
      const lastImportIndex = cssContent.lastIndexOf('@import');
      const endOfLineIndex = cssContent.indexOf('\n', lastImportIndex);
      cssContent =
        cssContent.slice(0, endOfLineIndex + 1) +
        darkThemeCss +
        cssContent.slice(endOfLineIndex + 1);
    } else {
      cssContent = darkThemeCss + cssContent;
    }
    await writeFile(globalsCssPath, cssContent);
  }
};

export const updateLayout = async (layoutPath: string): Promise<void> => {
  let layoutContent = await readFile(layoutPath);
  if (!layoutContent.includes('dark:bg-dark')) {
    layoutContent = layoutContent.replace(
      /className="([^"]*)"/,
      'className="$1 bg-light dark:bg-dark"',
    );
    await writeFile(layoutPath, layoutContent);
  }
};
