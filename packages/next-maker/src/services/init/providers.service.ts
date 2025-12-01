import path from 'node:path';
import { writeFile } from '../../core/files';
import { ProjectPrompts } from '../../prompts/create-app.prompt';
import { PROJECT_PATHS } from '../../config/paths';

export const generateRootProvider = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const imports: string[] = [];
  const providers: string[] = [];

  if (answers.redux) {
    imports.push("import { StoreProvider } from '@/providers';");
    providers.push('StoreProvider');
  }

  if (answers.darkMode) {
    imports.push("import { CustomThemeProvider } from '@/providers';");
    providers.push('CustomThemeProvider');
  }

  if (answers.i18n) {
    imports.push("import { NextIntlClientProvider, AbstractIntlMessages } from 'next-intl';");
    imports.push("import { SupportedLocale } from '@/types/i18n';");
  }

  let rootProviderContent = `'use client';
${imports.join('\n')}

export const RootProvider = ({
  children,
  ${answers.i18n ? 'locale,\n  messages,' : ''}
}: {
  children: React.ReactNode;
  ${answers.i18n ? 'locale: SupportedLocale;\n  messages: AbstractIntlMessages;' : ''}
}) => {
  return (
`;

  // Build the nesting
  let content = '{children}';

  if (answers.i18n) {
    content = `<NextIntlClientProvider locale={locale} messages={messages}>
          ${content}
        </NextIntlClientProvider>`;
  }

  if (answers.darkMode) {
    content = `<CustomThemeProvider>
        ${content}
      </CustomThemeProvider>`;
  }

  if (answers.redux) {
    content = `<StoreProvider>
      ${content}
    </StoreProvider>`;
  }

  // If no providers are wrapped, ensure we return a valid JSX element (Fragment)
  if (content === '{children}') {
    content = `<>{children}</>`;
  }

  rootProviderContent += `    ${content}
  );
};
`;

  await writeFile(path.join(projectPath, PROJECT_PATHS.ROOT_PROVIDER), rootProviderContent);
};

export const generateLayout = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  if (!answers.i18n) {
    const basicLayout = `import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Livvic } from 'next/font/google';
import { RootProvider } from '@/providers';

const livvic = Livvic({
  subsets: ['latin'],
  variable: '--font-livvic',
  weight: ['100', '200', '300', '400', '500', '600', '700', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '${answers.projectName}',
  description: '${answers.description}',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body className={\`\${livvic.variable} bg-light dark:bg-dark antialiased\`}>
        <RootProvider>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
`;
    await writeFile(path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT), basicLayout);

    const basicPage = `export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Welcome to ${answers.projectName}</h1>
      <p className="mt-4 text-xl">Get started by editing src/app/page.tsx</p>
    </div>
  );
}
`;
    await writeFile(path.join(projectPath, PROJECT_PATHS.ROOT_PAGE), basicPage);
  }
};
