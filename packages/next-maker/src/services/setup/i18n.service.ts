import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import * as fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { info, success, error } from '../../config/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getTemplatePath = (): string => {
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'Templates', 'nextjs-starter');
};

const copyDirectory = async (src: string, dest: string): Promise<void> => {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      const content = await readFile(srcPath, 'utf-8');
      await writeFile(destPath, content);
    }
  }
};

const copyFile = async (src: string, dest: string): Promise<void> => {
  await mkdir(path.dirname(dest), { recursive: true });
  const content = await readFile(src, 'utf-8');
  await writeFile(dest, content);
};

export const checkIfI18nExists = (targetDir: string): boolean => {
  const i18nPath = path.join(targetDir, 'src', 'i18n');
  return fs.existsSync(i18nPath);
};

export const setupI18n = async (targetDir: string): Promise<void> => {
  try {
    // Check if i18n already exists
    if (checkIfI18nExists(targetDir)) {
      info('next-intl is already configured in your project.');
      info('Skipping i18n setup...');
      return;
    }

    const templatePath = getTemplatePath();

    // Step 1: Copy i18n directory
    const i18nTemplatePath = path.join(templatePath, 'src', 'i18n');
    const i18nTargetPath = path.join(targetDir, 'src', 'i18n');

    if (fs.existsSync(i18nTemplatePath)) {
      await copyDirectory(i18nTemplatePath, i18nTargetPath);
      success('Copied i18n directory');
    }

    // Step 2: Copy types/i18n.ts
    const i18nTypesTemplatePath = path.join(templatePath, 'src', 'types', 'i18n.ts');
    const i18nTypesTargetPath = path.join(targetDir, 'src', 'types', 'i18n.ts');

    if (fs.existsSync(i18nTypesTemplatePath)) {
      await copyFile(i18nTypesTemplatePath, i18nTypesTargetPath);
      success('Copied types/i18n.ts');
    }

    // Step 3: Copy lib/config/app-locales.ts
    const appLocalesTemplatePath = path.join(
      templatePath,
      'src',
      'lib',
      'config',
      'app-locales.ts',
    );
    const appLocalesTargetPath = path.join(targetDir, 'src', 'lib', 'config', 'app-locales.ts');

    if (fs.existsSync(appLocalesTemplatePath)) {
      await copyFile(appLocalesTemplatePath, appLocalesTargetPath);
      success('Copied lib/config/app-locales.ts');
    }

    // Step 4: Update lib/config/index.ts to export appLocales
    await updateConfigIndex(targetDir);

    // Step 5: Update types/index.ts to export i18n types
    await updateTypesIndex(targetDir);

    // Step 6: Create/update src/proxy.ts (middleware)
    await createProxyMiddleware(targetDir, templatePath);

    // Step 7: Update next.config.ts
    await updateNextConfig(targetDir);

    // Step 8: Update RootProvider to include NextIntlClientProvider
    await updateRootProvider(targetDir);

    // Step 9: Update layout.tsx to use i18n
    await updateLayout(targetDir, templatePath);
  } catch (err) {
    error(`Failed to setup i18n: ${err}`);
    throw err;
  }
};

const updateConfigIndex = async (targetDir: string): Promise<void> => {
  const configIndexPath = path.join(targetDir, 'src', 'lib', 'config', 'index.ts');

  try {
    const content = await readFile(configIndexPath, 'utf-8');

    if (content.includes("export * from './app-locales'")) {
      info('appLocales already exported in lib/config/index.ts');
      return;
    }

    const updatedContent = content + `export * from './app-locales';\n`;
    await writeFile(configIndexPath, updatedContent);
    success('Updated lib/config/index.ts to export appLocales');
  } catch {
    // File doesn't exist, create it
    await mkdir(path.dirname(configIndexPath), { recursive: true });
    const content = `export * from './app-locales';\n`;
    await writeFile(configIndexPath, content);
    success('Created lib/config/index.ts with appLocales export');
  }
};

const updateTypesIndex = async (targetDir: string): Promise<void> => {
  const typesIndexPath = path.join(targetDir, 'src', 'types', 'index.ts');

  try {
    const content = await readFile(typesIndexPath, 'utf-8');

    if (content.includes("export * from './i18n'")) {
      info('i18n types already exported in types/index.ts');
      return;
    }

    const updatedContent = content + `export * from './i18n';\n`;
    await writeFile(typesIndexPath, updatedContent);
    success('Updated types/index.ts to export i18n types');
  } catch {
    // File doesn't exist, create it
    await mkdir(path.dirname(typesIndexPath), { recursive: true });
    const content = `export * from './i18n';\n`;
    await writeFile(typesIndexPath, content);
    success('Created types/index.ts with i18n types export');
  }
};

const createProxyMiddleware = async (targetDir: string, templatePath: string): Promise<void> => {
  const proxyPath = path.join(targetDir, 'src', 'proxy.ts');
  const middlewarePath = path.join(targetDir, 'src', 'middleware.ts');

  // Check if middleware.ts exists (older convention)
  try {
    const content = await readFile(middlewarePath, 'utf-8');
    if (content.includes('next-intl')) {
      info('Middleware already configured with next-intl');
      return;
    }
  } catch {
    // File doesn't exist
  }

  // Copy proxy.ts from template
  const proxyTemplatePath = path.join(templatePath, 'src', 'proxy.ts');
  if (fs.existsSync(proxyTemplatePath)) {
    await copyFile(proxyTemplatePath, proxyPath);
    success('Created src/proxy.ts with next-intl middleware');
  }
};

const updateNextConfig = async (targetDir: string): Promise<void> => {
  const nextConfigPath = path.join(targetDir, 'next.config.ts');

  try {
    const content = await readFile(nextConfigPath, 'utf-8');

    // Check if already configured
    if (content.includes('createNextIntlPlugin') || content.includes('next-intl')) {
      info('next.config.ts already configured with next-intl');
      return;
    }

    // Add import and wrap config
    const importLine = `import createNextIntlPlugin from 'next-intl/plugin';\n`;
    const withNextIntlLine = `const withNextIntl = createNextIntlPlugin();\n`;

    // Find export default line
    const exportMatch = content.match(/export default (.+);/);
    if (!exportMatch) {
      error('Could not find export default in next.config.ts');
      return;
    }

    const configName = exportMatch[1].trim();

    // Build new content
    let updatedContent = content;

    // Add import at the top (after any existing imports)
    const lastImportMatch = content.match(/import .+ from .+;\n/g);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      updatedContent =
        content.slice(0, lastImportIndex + lastImport.length) +
        '\n' +
        importLine +
        content.slice(lastImportIndex + lastImport.length);
    } else {
      // No imports found, add at the top
      updatedContent = importLine + '\n' + content;
    }

    // Add withNextIntl initialization before export
    updatedContent = updatedContent.replace(
      /export default/,
      withNextIntlLine + '\nexport default',
    );

    // Wrap the config
    updatedContent = updatedContent.replace(
      `export default ${configName};`,
      `export default withNextIntl(${configName});`,
    );

    await writeFile(nextConfigPath, updatedContent);
    success('Updated next.config.ts to use createNextIntlPlugin');
  } catch {
    error('next.config.ts not found');
  }
};

const updateRootProvider = async (targetDir: string): Promise<void> => {
  const rootProviderPath = path.join(targetDir, 'src', 'providers', 'RootProvider.tsx');

  try {
    const content = await readFile(rootProviderPath, 'utf-8');

    // Check if already configured
    if (content.includes('NextIntlClientProvider') || content.includes('next-intl')) {
      info('RootProvider already configured with NextIntlClientProvider');
      return;
    }

    // Add imports
    const importLines = `import { SupportedLocale } from '@/types/i18n';\nimport { NextIntlClientProvider } from 'next-intl';\nimport { AbstractIntlMessages } from 'next-intl';\n`;

    // Add to existing imports
    let updatedContent = content;

    // Find last import
    const lastImportMatch = content.match(/import .+ from .+;\n/g);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      updatedContent =
        content.slice(0, lastImportIndex + lastImport.length) +
        importLines +
        content.slice(lastImportIndex + lastImport.length);
    }

    // Update function signature to accept locale and messages
    updatedContent = updatedContent.replace(
      /export const RootProvider = \(\{\s*children,?\s*\}: \{[^}]+\}\)/,
      `export const RootProvider = ({\n  children,\n  locale,\n  messages,\n}: {\n  children: React.ReactNode;\n  locale: SupportedLocale;\n  messages: AbstractIntlMessages;\n})`,
    );

    // Wrap children with NextIntlClientProvider
    // Handle different return patterns

    // Case 1: Fragment <> or </> pattern
    if (updatedContent.includes('return <>{children}</>;')) {
      updatedContent = updatedContent.replace(
        'return <>{children}</>;',
        `return (\n    <NextIntlClientProvider locale={locale} messages={messages}>\n      {children}\n    </NextIntlClientProvider>\n  );`,
      );
    }
    // Case 2: Complex return with nested components
    else {
      const returnMatch = updatedContent.match(/return \(([\s\S]+?)\);[\s]*\}/);
      if (returnMatch) {
        const returnContent = returnMatch[1];

        // Find the innermost children (last closing tag before final closing tags)
        const childrenMatch = returnContent.match(/>\s*\{children\}\s*</);
        if (childrenMatch) {
          const wrappedReturn = returnContent.replace(
            />\s*\{children\}\s*</,
            `>\n        <NextIntlClientProvider locale={locale} messages={messages}>\n          {children}\n        </NextIntlClientProvider>\n      <`,
          );

          updatedContent = updatedContent.replace(returnContent, wrappedReturn);
        }
      }
    }

    await writeFile(rootProviderPath, updatedContent);
    success('Updated RootProvider to include NextIntlClientProvider');
  } catch {
    error('RootProvider.tsx not found');
  }
};

const updateLayout = async (targetDir: string, templatePath: string): Promise<void> => {
  const layoutPath = path.join(targetDir, 'src', 'app', '[locale]', 'layout.tsx');

  // Check if [locale] folder exists
  const localeFolderPath = path.join(targetDir, 'src', 'app', '[locale]');
  if (!fs.existsSync(localeFolderPath)) {
    // Need to create [locale] folder structure
    await mkdir(localeFolderPath, { recursive: true });

    // Copy layout.tsx from template
    const layoutTemplatePath = path.join(templatePath, 'src', 'app', '[locale]', 'layout.tsx');
    if (fs.existsSync(layoutTemplatePath)) {
      await copyFile(layoutTemplatePath, layoutPath);
      success('Created [locale]/layout.tsx with i18n configuration');
    }

    // Copy page.tsx from app root to [locale] if it exists
    const rootPagePath = path.join(targetDir, 'src', 'app', 'page.tsx');
    const localePagePath = path.join(targetDir, 'src', 'app', '[locale]', 'page.tsx');

    if (fs.existsSync(rootPagePath)) {
      fs.renameSync(rootPagePath, localePagePath);
      success('Moved page.tsx to [locale]/page.tsx');
    } else {
      // Copy from template
      const pageTemplatePath = path.join(templatePath, 'src', 'app', '[locale]', 'page.tsx');
      if (fs.existsSync(pageTemplatePath)) {
        await copyFile(pageTemplatePath, localePagePath);
        success('Created [locale]/page.tsx from template');
      }
    }

    // Remove old layout if it exists in app root
    const rootLayoutPath = path.join(targetDir, 'src', 'app', 'layout.tsx');
    if (fs.existsSync(rootLayoutPath)) {
      fs.unlinkSync(rootLayoutPath);
      info('Removed old app/layout.tsx');
    }

    return;
  }

  // [locale] folder exists, check if layout needs updating
  if (!fs.existsSync(layoutPath)) {
    const layoutTemplatePath = path.join(templatePath, 'src', 'app', '[locale]', 'layout.tsx');
    if (fs.existsSync(layoutTemplatePath)) {
      await copyFile(layoutTemplatePath, layoutPath);
      success('Created [locale]/layout.tsx with i18n configuration');
    }
    return;
  }

  try {
    const content = await readFile(layoutPath, 'utf-8');

    // Check if already configured
    if (content.includes('next-intl') || content.includes('setRequestLocale')) {
      info('[locale]/layout.tsx already configured with i18n');
      return;
    }

    info('[locale]/layout.tsx exists but may need manual i18n configuration');
  } catch {
    // File doesn't exist or can't be read
  }
};
