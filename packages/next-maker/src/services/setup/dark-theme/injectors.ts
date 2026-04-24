import path from 'node:path';
import { PROJECT_PATHS } from '../../../config/paths';
import { fileExists, readFile, writeFile } from '../../../core/files';

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
  if (!fileExists(rootProviderPath)) return;

  let content = await readFile(rootProviderPath);

  const useClientDirective = "'use client';";
  const hasUseClient = content.includes(useClientDirective);
  if (hasUseClient) {
    content = content.replace(useClientDirective, '').trim();
  }

  // Add CustomThemeProvider import if missing
  if (!content.includes('CustomThemeProvider')) {
    if (/import\s*\{[^}]*\}\s*from\s*'@\/providers'/.test(content)) {
      content = content.replace(
        /(import\s*\{)([^}]*)(\}\s*from\s*'@\/providers')/,
        (_m, open, names, close) =>
          `${open}${names.trim() ? `${names.trim()}, CustomThemeProvider ` : ' CustomThemeProvider '}${close}`,
      );
    } else {
      content = `import { CustomThemeProvider } from '@/providers';\n${content}`;
    }
  }

  if (hasUseClient) {
    content = `${useClientDirective}\n${content}`;
  }

  // Wrap {children} with CustomThemeProvider (innermost to preserve any outer providers)
  if (!content.includes('<CustomThemeProvider')) {
    if (content.includes('{children}')) {
      content = content.replace(
        /\{children\}/,
        '<CustomThemeProvider>{children}</CustomThemeProvider>',
      );
    } else {
      // Fallback: wrap entire return JSX
      const returnMatch = content.match(/return\s*\(\s*([\s\S]*?)\s*\);/);
      if (returnMatch) {
        content = content.replace(
          returnMatch[0],
          `return (\n    <CustomThemeProvider>\n      ${returnMatch[1]}\n    </CustomThemeProvider>\n  );`,
        );
      }
    }
  }

  await writeFile(rootProviderPath, content);
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
