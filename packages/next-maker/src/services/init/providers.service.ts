import path from 'node:path';
import { PROJECT_PATHS } from '../../config/paths';
import { writeFile } from '../../core/files';
import type { ProjectPrompts } from '../../prompts/create-app.prompt';

export const generateRootProvider = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const imports: string[] = [];

  if (answers.i18n) {
    imports.push("import { type AbstractIntlMessages, NextIntlClientProvider } from 'next-intl';");
  }

  if (answers.darkMode) {
    imports.push("import { CustomThemeProvider } from '@/providers';");
  }

  if (answers.redux) {
    imports.push("import type { AppState } from '@/store';");
  }

  if (answers.i18n) {
    imports.push("import type { SupportedLocale } from '@/types/i18n';");
  }

  if (answers.redux) {
    imports.push("import { StoreProvider } from './StoreProvider';");
  }

  const propsFields: string[] = ['children: React.ReactNode;'];
  const destructureFields: string[] = ['children'];

  if (answers.i18n) {
    propsFields.push('locale: SupportedLocale;');
    propsFields.push('messages: AbstractIntlMessages;');
    propsFields.push('timeZone: string;');
    destructureFields.push('locale', 'messages', 'timeZone');
  }

  if (answers.redux) {
    propsFields.push('preloadedState?: Partial<AppState>;');
    destructureFields.push('preloadedState');
  }

  // Build the nested JSX from innermost to outermost
  let jsx = '{children}';

  if (answers.i18n) {
    jsx = `<NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          ${jsx}
        </NextIntlClientProvider>`;
  }

  if (answers.darkMode) {
    jsx = `<CustomThemeProvider>
        ${jsx}
      </CustomThemeProvider>`;
  }

  if (answers.redux) {
    jsx = `<StoreProvider preloadedState={preloadedState}>
      ${jsx}
    </StoreProvider>`;
  }

  // Ensure a valid JSX expression even with no wrappers
  if (jsx === '{children}') {
    jsx = '<>{children}</>';
  }

  const propsType = `type RootProviderProps = {
  ${propsFields.join('\n  ')}
};`;

  const rootProviderContent = `'use client';
${imports.join('\n')}

${propsType}

export const RootProvider = ({ ${destructureFields.join(', ')} }: RootProviderProps) => {
  return (
    ${jsx}
  );
};
`;

  await writeFile(path.join(projectPath, PROJECT_PATHS.ROOT_PROVIDER), rootProviderContent);
};

export const generateLayout = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  if (answers.i18n) return;

  const htmlClasses = `\`\${livvic.variable} ${answers.darkMode ? 'bg-light antialiased dark:bg-dark' : 'antialiased'}\``;
  const providerPropsLine = answers.redux ? '' : '';

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
    <html lang="en"${answers.darkMode ? ' suppressHydrationWarning={true}' : ''}>
      <body className={${htmlClasses}}>
        <RootProvider${providerPropsLine}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
`;
  await writeFile(path.join(projectPath, PROJECT_PATHS.ROOT_LAYOUT), basicLayout);

  const counterImport = answers.redux ? "import { Counter } from '@/features/counter';\n\n" : '';
  const counterComponent = answers.redux ? '\n      <Counter />' : '';

  const basicPage = `${counterImport}export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Welcome to ${answers.projectName}</h1>
      <p className="mt-4 text-xl">Get started by editing src/app/page.tsx</p>${counterComponent}
    </div>
  );
}
`;
  await writeFile(path.join(projectPath, PROJECT_PATHS.ROOT_PAGE), basicPage);
};
