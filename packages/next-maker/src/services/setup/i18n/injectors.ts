import path from 'node:path';
import { fileExists, readFile, writeFile, deleteFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import fs from 'node:fs/promises';

export const updateNextConfig = async (projectPath: string): Promise<void> => {
  const nextConfigPath = path.join(projectPath, PROJECT_PATHS.NEXT_CONFIG);
  if (fileExists(nextConfigPath)) {
    let content = await readFile(nextConfigPath);
    if (!content.includes('createNextIntlPlugin')) {
      content = "import createNextIntlPlugin from 'next-intl/plugin';\n" + content;

      const exportDefaultRegex = /export default (.*?);/;
      if (exportDefaultRegex.test(content)) {
        content = content.replace(
          exportDefaultRegex,
          '\nconst withNextIntl = createNextIntlPlugin();\nexport default withNextIntl($1);',
        );
      } else {
        // Fallback if no export default found (unlikely but safe)
        content += '\nconst withNextIntl = createNextIntlPlugin();\n';
        content += 'export default withNextIntl(nextConfig);\n';
      }

      await writeFile(nextConfigPath, content);
    }
  }
};

export const updateTypesIndex = async (projectPath: string): Promise<void> => {
  const typesIndexPath = path.join(projectPath, PROJECT_PATHS.TYPES_INDEX);
  if (fileExists(typesIndexPath)) {
    let content = await readFile(typesIndexPath);
    if (!content.includes('./i18n')) {
      content += "export * from './i18n';\n";
      await writeFile(typesIndexPath, content);
    }
  }
};

export const updateConfigIndex = async (projectPath: string): Promise<void> => {
  const configIndexPath = path.join(projectPath, PROJECT_PATHS.CONFIG_INDEX);
  if (fileExists(configIndexPath)) {
    let content = await readFile(configIndexPath);
    if (!content.includes('./app-locales')) {
      content += "export * from './app-locales';\n";
      await writeFile(configIndexPath, content);
    }
  }
};

export const updateRootProvider = async (projectPath: string): Promise<void> => {
  const rootProviderPath = path.join(projectPath, 'src/providers/RootProvider.tsx');
  if (fileExists(rootProviderPath)) {
    let content = await readFile(rootProviderPath);

    // Handle 'use client'
    const useClientDirective = "'use client';";
    const hasUseClient = content.includes(useClientDirective);

    if (hasUseClient) {
      content = content.replace(useClientDirective, '').trim();
    }

    // Add imports
    if (!content.includes('next-intl')) {
      const imports = `import { SupportedLocale } from '@/types/i18n';
import { NextIntlClientProvider, AbstractIntlMessages } from 'next-intl';
`;
      content = imports + content;
    }

    // Re-add 'use client' at the top
    if (hasUseClient) {
      content = useClientDirective + '\n' + content;
    }

    // Update Props
    // Replace props type or signature
    if (!content.includes('locale: SupportedLocale')) {
      // Try to find the props definition
      // This assumes a specific structure, might need to be more robust
      // We'll look for the component definition
      const componentRegex = /export const RootProvider = \(\{([\s\S]*?)\}: \{([\s\S]*?)\}\) => \{/;
      const match = content.match(componentRegex);

      if (match) {
        const newParams = `\n  children,\n  locale,\n  messages,`;
        const newTypes = `\n  children: React.ReactNode;\n  locale: SupportedLocale;\n  messages: AbstractIntlMessages;`;

        content = content.replace(
          match[0],
          `export const RootProvider = ({${newParams}\n}: {${newTypes}\n}) => {`,
        );
      }
    }

    // Wrap with NextIntlClientProvider
    if (!content.includes('<NextIntlClientProvider')) {
      const returnMatch = content.match(/return \(\s*([\s\S]*?)\s*\);/);
      if (returnMatch) {
        // We want NextIntlClientProvider to be inside CustomThemeProvider if possible, or just wrap children
        // But usually it wraps everything inside the provider
        // Let's wrap the inner content
        content = content.replace(/return \(\s*<([^>]+)([^>]*)>([\s\S]*)<\/\1>\s*\);/, (match) => {
          return match.replace(
            /\{children\}/,
            `<NextIntlClientProvider locale={locale} messages={messages}>\n          {children}\n        </NextIntlClientProvider>`,
          );
        });
      }
    }

    await writeFile(rootProviderPath, content);
  }
};

export const migrateToLocaleStructure = async (projectPath: string): Promise<void> => {
  const rootLayoutPath = path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT);
  const rootPagePath = path.join(projectPath, PROJECT_PATHS.ROOT_PAGE);
  const localeDir = path.join(projectPath, 'src/app/[locale]');

  // Create [locale] directory
  await fs.mkdir(localeDir, { recursive: true });

  // Move Layout
  if (fileExists(rootLayoutPath)) {
    const destLayoutPath = path.join(localeDir, 'layout.tsx');
    let content = await readFile(rootLayoutPath);

    // Add imports
    if (!content.includes('next-intl')) {
      content =
        `import { routing } from '@/i18n/routing';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { setRequestLocale, getMessages } from 'next-intl/server';
` + content;
    }

    // Add generateStaticParams
    if (!content.includes('generateStaticParams')) {
      const metadataEndIndex = content.indexOf('};', content.indexOf('export const metadata'));
      if (metadataEndIndex !== -1) {
        const insertPos = metadataEndIndex + 2;
        content =
          content.slice(0, insertPos) +
          `\n\nexport function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}` +
          content.slice(insertPos);
      }
    }

    // Update RootLayout signature and body
    // Replace props type
    content = content.replace(
      /Readonly<\{\s*children:\s*React\.ReactNode;\s*}>/,
      `Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>`,
    );

    // Add logic inside function
    // Handle both async and non-async function definitions
    const functionBodyRegex =
      /export default (async )?function RootLayout\(\{\s*children,?\s*\}\s*:/;
    const functionMatch = content.match(functionBodyRegex);

    if (functionMatch) {
      const isAsync = functionMatch[1];

      // Ensure it's async
      if (!isAsync) {
        content = content.replace('export default function', 'export default async function');
      }

      // 1. Inject params destructuring
      content = content.replace(
        /export default (async )?function RootLayout\(\{\s*children,?\s*\}\s*:/,
        'export default async function RootLayout({ children, params }:',
      );

      // 2. Inject logic at start of function
      const bodyStartRegex = /export default async function RootLayout[\s\S]*?\)\s*\{/;
      const bodyMatch = content.match(bodyStartRegex);

      if (bodyMatch && bodyMatch.index !== undefined) {
        const bodyOpenBrace = bodyMatch.index + bodyMatch[0].length - 1;
        const logic = `
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
`;
        content = content.slice(0, bodyOpenBrace + 1) + logic + content.slice(bodyOpenBrace + 1);
      }

      // 3. Update RootProvider usage
      content = content.replace(
        /<RootProvider>/,
        '<RootProvider locale={locale} messages={messages}>',
      );

      // 4. Update html lang
      content = content.replace(/<html lang="en"/, '<html lang={locale}');
    }

    await writeFile(destLayoutPath, content);
    await deleteFile(rootLayoutPath);
  }

  // Move Page
  if (fileExists(rootPagePath)) {
    const destPagePath = path.join(localeDir, 'page.tsx');
    let content = await readFile(rootPagePath);

    // Add imports
    if (!content.includes('next-intl')) {
      content =
        `import { SupportedLocale } from '@/types/i18n';
import { setRequestLocale } from 'next-intl/server';
` + content;
    }

    // Update Page signature
    content = content.replace(
      /export default function Home\(\)/,
      `type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home(props: Props)`,
    );

    // Inject logic
    const bodyOpenBrace = content.indexOf('export default async function Home(props: Props) {');
    if (bodyOpenBrace !== -1) {
      const logic = `
  const locale = (await props.params).locale as SupportedLocale;
  setRequestLocale(locale);
`;
      const braceIndex = content.indexOf('{', bodyOpenBrace);
      content = content.slice(0, braceIndex + 1) + logic + content.slice(braceIndex + 1);
    }

    await writeFile(destPagePath, content);
    await deleteFile(rootPagePath);
  }
};
