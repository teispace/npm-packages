import { Command } from 'commander';
import degit from 'degit';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import pc from 'picocolors';
import { startSpinner } from '../config/spinner';
import { promptForProjectDetails } from '../prompts/create-app.prompt';
import {
  readFile,
  writeFile,
  deleteFile,
  deleteDirectory,
  updateJson,
  fileExists,
} from '../core/files';
import { initializeGit, addRemote } from '../core/git';
import { installDependencies, runScript } from '../core/package-manager';
import { log, printBanner } from '../config';

export const registerAppCommand = (program: Command) => {
  program
    .command('init')
    .description('Initialize a new Next.js project')
    .argument('[name]', 'Project name')
    .action(async (name) => {
      await createApp(name);
    });
};

const createApp = async (initialName?: string): Promise<void> => {
  printBanner();
  log('Welcome to the Teispace Next.js App Creator!');
  log('');

  const answers = await promptForProjectDetails(initialName);
  const projectPath = path.resolve(process.cwd(), answers.projectName);

  if (fileExists(projectPath)) {
    console.error(pc.red(`Error: Directory ${answers.projectName} already exists.`));
    process.exit(1);
  }

  const spinner = startSpinner('Initializing project...');

  try {
    // 1. Clone template
    spinner.text = 'Downloading template...';
    const emitter = degit('teispace/nextjs-starter', {
      cache: false,
      force: true,
      verbose: true,
    });
    await emitter.clone(projectPath);

    // 2. Update package.json
    spinner.text = 'Configuring package.json...';
    await updateJson(path.join(projectPath, 'package.json'), (pkg) => {
      pkg.name = answers.projectName;
      pkg.version = answers.version;
      pkg.description = answers.description;
      pkg.author = answers.author;
      // Remove packageManager field to avoid "configured to use yarn" errors
      // and let the user's environment handle it.
      delete pkg.packageManager;

      if (answers.gitHomepage) pkg.homepage = answers.gitHomepage;
      if (answers.gitIssues) pkg.bugs = { url: answers.gitIssues };
      if (answers.gitRemote) pkg.repository = { type: 'git', url: answers.gitRemote };

      // Remove dependencies based on choices
      if (!answers.redux) {
        delete pkg.dependencies['@reduxjs/toolkit'];
        delete pkg.dependencies['react-redux'];
        delete pkg.dependencies['redux-persist'];
      }

      // Handle react-secure-storage
      // Keep if HTTP client is selected OR if user explicitly selected it
      const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;
      if (!keepSecureStorage) {
        delete pkg.dependencies['react-secure-storage'];
      }
      if (!answers.i18n) {
        delete pkg.dependencies['next-intl'];
      }
      if (!answers.darkMode) {
        delete pkg.dependencies['next-themes'];
      }
      if (answers.httpClient === 'none') {
        delete pkg.dependencies['axios'];
      } else if (answers.httpClient === 'fetch') {
        delete pkg.dependencies['axios'];
      }

      // DevTools cleanup is handled later to group file and package.json changes

      return pkg;
    });

    // 3. Handle Features
    spinner.text = 'Customizing features...';

    // HTTP Client
    const httpUtilsPath = path.join(projectPath, 'src/lib/utils/http');

    // Define keepSecureStorage early as it's used in multiple places
    const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;

    if (answers.httpClient === 'none') {
      await deleteDirectory(path.join(httpUtilsPath, 'axios-client'));
      await deleteDirectory(path.join(httpUtilsPath, 'fetch-client'));

      if (keepSecureStorage) {
        // Clear index.ts but keep token-store export
        await writeFile(path.join(httpUtilsPath, 'index.ts'), "export * from './token-store';\n");
      } else {
        // If no client and no secure storage, we don't need http utils at all
        // This removes token-store.ts and index.ts
        await deleteDirectory(httpUtilsPath);

        // Also remove export from src/lib/utils/index.ts
        const utilsIndexPath = path.join(projectPath, 'src/lib/utils/index.ts');
        if (fileExists(utilsIndexPath)) {
          let content = await readFile(utilsIndexPath);
          content = content.replace(/export \* from '\.\/http';\n/, '');
          await writeFile(utilsIndexPath, content);
        }
      }

      // Remove API constants
      const constantsPath = path.join(projectPath, 'src/lib/config/constants.ts');
      if (fileExists(constantsPath)) {
        let content = await readFile(constantsPath);
        content = content.replace(/export const API_RESPONSE_DATA_KEY = 'data';\n/, '');
        content = content.replace(/export const SAVE_AUTH_TOKENS = false;\n/, '');
        await writeFile(constantsPath, content);
      }

      // Remove errors and types
      await deleteDirectory(path.join(projectPath, 'src/lib/errors'));
      await deleteDirectory(path.join(projectPath, 'src/types/utility'));
      await deleteDirectory(path.join(projectPath, 'src/types/common'));

      // Update types/index.ts
      const typesIndexPath = path.join(projectPath, 'src/types/index.ts');
      if (fileExists(typesIndexPath)) {
        let content = await readFile(typesIndexPath);
        content = content.replace(/export \* from '\.\/utility';\n/, '');
        content = content.replace(/export \* from '\.\/common';\n/, '');
        await writeFile(typesIndexPath, content);
      }
    } else if (answers.httpClient === 'axios') {
      await deleteDirectory(path.join(httpUtilsPath, 'fetch-client'));
      // Update index.ts
      let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
      content = content.replace(/export .* from '\.\/fetch-client';\n/g, '');
      await writeFile(path.join(httpUtilsPath, 'index.ts'), content);
    } else if (answers.httpClient === 'fetch') {
      await deleteDirectory(path.join(httpUtilsPath, 'axios-client'));
      // Update index.ts
      let content = await readFile(path.join(httpUtilsPath, 'index.ts'));
      content = content.replace(/export .* from '\.\/axios-client';\n/g, '');
      await writeFile(path.join(httpUtilsPath, 'index.ts'), content);
    }

    // Secure Storage Service Cleanup
    if (!keepSecureStorage) {
      await deleteDirectory(path.join(projectPath, 'src/services/storage'));
    }

    // Dynamic RootProvider Generation
    const providers: string[] = [];
    const imports: string[] = [];

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
    // instead of an object literal
    if (content === '{children}') {
      content = `<>{children}</>`;
    }

    rootProviderContent += `    ${content}
  );
};
`;

    await writeFile(path.join(projectPath, 'src/providers/RootProvider.tsx'), rootProviderContent);

    // Clean up individual feature handlers that were modifying RootProvider
    // Redux
    if (!answers.redux) {
      await deleteDirectory(path.join(projectPath, 'src/store'));
      // Remove the counter feature as it depends on Redux
      await deleteDirectory(path.join(projectPath, 'src/features/counter'));
      await deleteFile(path.join(projectPath, 'src/providers/StoreProvider.tsx'));

      // Delete Count component as it uses Redux
      await deleteFile(path.join(projectPath, 'src/components/Count.tsx'));

      // Update src/providers/index.ts
      const providersIndexPath = path.join(projectPath, 'src/providers/index.ts');
      let providersIndexContent = await readFile(providersIndexPath);
      providersIndexContent = providersIndexContent.replace(
        /export \* from '\.\/StoreProvider';\n/,
        '',
      );
      await writeFile(providersIndexPath, providersIndexContent);

      // Update src/components/index.ts
      const componentsIndexPath = path.join(projectPath, 'src/components/index.ts');
      if (fileExists(componentsIndexPath)) {
        let componentsIndexContent = await readFile(componentsIndexPath);
        componentsIndexContent = componentsIndexContent.replace(
          /export \* from '\.\/Count';\n?/,
          '',
        );
        await writeFile(componentsIndexPath, componentsIndexContent);
      }
    }

    // Dark Mode
    if (!answers.darkMode) {
      await deleteFile(path.join(projectPath, 'src/providers/CustomThemeProvider.tsx'));
      // Update src/providers/index.ts
      const providersIndexPath = path.join(projectPath, 'src/providers/index.ts');
      let providersIndexContent = await readFile(providersIndexPath);
      providersIndexContent = providersIndexContent.replace(
        /export \* from '\.\/CustomThemeProvider';\n/,
        '',
      );
      await writeFile(providersIndexPath, providersIndexContent);

      // Update src/styles/globals.css for Tailwind v4
      const globalsCssPath = path.join(projectPath, 'src/styles/globals.css');
      if (fileExists(globalsCssPath)) {
        let cssContent = await readFile(globalsCssPath);
        cssContent = cssContent.replace(/@custom-variant dark \(.*?\);\n?/, '');
        await writeFile(globalsCssPath, cssContent);
      }
    }

    // i18n
    if (!answers.i18n) {
      await deleteDirectory(path.join(projectPath, 'src/i18n'));
      await deleteDirectory(path.join(projectPath, 'src/app/[locale]'));
      await deleteFile(path.join(projectPath, 'src/proxy.ts'));
      await deleteFile(path.join(projectPath, 'src/middleware.ts')); // Just in case
      await deleteFile(path.join(projectPath, 'src/types/i18n.ts'));
      await deleteFile(path.join(projectPath, 'src/lib/config/app-locales.ts'));

      // Update src/types/index.ts
      const typesIndexPath = path.join(projectPath, 'src/types/index.ts');
      if (fileExists(typesIndexPath)) {
        let content = await readFile(typesIndexPath);
        content = content.replace(/export \* from '\.\/i18n';\n/, '');
        await writeFile(typesIndexPath, content);
      }

      // Update src/lib/config/index.ts
      const configIndexPath = path.join(projectPath, 'src/lib/config/index.ts');
      if (fileExists(configIndexPath)) {
        let content = await readFile(configIndexPath);
        content = content.replace(/export \* from '\.\/app-locales';\n/, '');
        await writeFile(configIndexPath, content);
      }

      // Update next.config.ts
      const nextConfigPath = path.join(projectPath, 'next.config.ts');
      if (fileExists(nextConfigPath)) {
        let configContent = await readFile(nextConfigPath);
        configContent = configContent.replace(
          /import createNextIntlPlugin from 'next-intl\/plugin';\n/,
          '',
        );
        configContent = configContent.replace(
          /const withNextIntl = createNextIntlPlugin\(\);\n/,
          '',
        );
        // Updated regex to handle removal of bundle analyzer wrapper
        // Template now likely has: export default withNextIntl(nextConfig);
        // We want: export default nextConfig;
        configContent = configContent.replace(
          /export default withNextIntl\(nextConfig\);/,
          'export default nextConfig;',
        );
        // Fallback for old template structure just in case (withAnalyzer)
        configContent = configContent.replace(
          /export default withNextIntl\(withAnalyzer\(nextConfig\)\);/,
          'export default withAnalyzer(nextConfig);',
        );
        await writeFile(nextConfigPath, configContent);
      }

      // Create basic layout
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
      await writeFile(path.join(projectPath, 'src/app/layout.tsx'), basicLayout);

      // Create basic page
      const basicPage = `export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">Welcome to ${answers.projectName}</h1>
      <p className="mt-4 text-xl">Get started by editing src/app/page.tsx</p>
    </div>
  );
}
`;
      await writeFile(path.join(projectPath, 'src/app/page.tsx'), basicPage);
    }

    // License - Always remove the existing LICENSE file
    await deleteFile(path.join(projectPath, 'LICENSE'));

    // Community Files
    const allCommunityFiles = ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md'];
    for (const file of allCommunityFiles) {
      if (!answers.communityFiles.includes(file)) {
        await deleteFile(path.join(projectPath, file));
      }
    }

    // Changelog - Always remove the existing CHANGELOG.md
    await deleteFile(path.join(projectPath, 'CHANGELOG.md'));

    // Readme Handling
    // 1. Find all README.md files (recursively)
    const findReadmes = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          files.push(...(await findReadmes(fullPath)));
        } else if (entry.isFile() && entry.name.toLowerCase() === 'readme.md') {
          files.push(fullPath);
        }
      }
      return files;
    };

    const allReadmes = await findReadmes(projectPath);
    const rootReadmePath = path.join(projectPath, 'README.md');

    // 2. Delete all non-root READMEs
    for (const readmePath of allReadmes) {
      if (readmePath !== rootReadmePath) {
        await deleteFile(readmePath);
      }
    }

    // 3. Handle root README
    if (answers.readme) {
      // Generate simple README
      const simpleReadme = `# ${answers.projectName}

${answers.description}

## Getting Started

First, run the development server:

\`\`\`bash
${answers.packageManager === 'npm' ? 'npm run dev' : answers.packageManager + ' dev'}
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
`;
      await writeFile(rootReadmePath, simpleReadme);
    } else {
      // Delete root README
      await deleteFile(rootReadmePath);
    }

    // Docker
    if (!answers.docker) {
      await deleteFile(path.join(projectPath, 'Dockerfile'));
      await deleteFile(path.join(projectPath, 'docker-compose.yml'));
      await deleteFile(path.join(projectPath, '.dockerignore'));

      // Remove Docker env vars from .env.example
      const envPath = path.join(projectPath, '.env.example');
      if (fileExists(envPath)) {
        let envContent = await readFile(envPath);
        envContent = envContent.replace(/# Docker Compose Configuration\n/, '');
        envContent = envContent.replace(/CONTAINER_NAME=.*\n/, '');
        envContent = envContent.replace(/IMAGE_NAME=.*\n/, '');
        envContent = envContent.replace(/IMAGE_TAG=.*\n/, '');
        await writeFile(envPath, envContent);
      }
    } else {
      // Update Docker env vars in .env.example
      const envPath = path.join(projectPath, '.env.example');
      if (fileExists(envPath)) {
        let envContent = await readFile(envPath);

        // Helper to update or append env var
        const updateEnvVar = (key: string, value: string) => {
          const regex = new RegExp(`${key}=.*`);
          if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
          } else {
            envContent += `${key}=${value}\n`;
          }
        };

        updateEnvVar('CONTAINER_NAME', answers.containerName || 'next-app');
        updateEnvVar('IMAGE_NAME', answers.imageName || 'nextjs-starter');
        updateEnvVar('IMAGE_TAG', answers.imageTag || 'latest');

        await writeFile(envPath, envContent);
      }
    }

    // CI/CD
    if (!answers.ci) {
      await deleteDirectory(path.join(projectPath, '.github/workflows'));
    }

    // GitHub Templates
    const githubPath = path.join(projectPath, '.github');
    if (!answers.keepTemplates) {
      await deleteDirectory(path.join(githubPath, 'ISSUE_TEMPLATE'));
      await deleteFile(path.join(githubPath, 'PULL_REQUEST_TEMPLATE.md'));
    } else {
      // Update templates with config
      const issueTemplatePath = path.join(githubPath, 'ISSUE_TEMPLATE');
      const prTemplatePath = path.join(githubPath, 'PULL_REQUEST_TEMPLATE.md');

      // Helper to replace placeholders
      const replacePlaceholders = (content: string) => {
        return content
          .replace(/Teispace/g, answers.company)
          .replace(/support@teispace\.com/g, answers.email)
          .replace(/Next\.js Starter/g, answers.projectName)
          .replace(/\[AUTHOR\]/g, answers.author)
          .replace(/\[COMPANY\]/g, answers.company)
          .replace(/\[EMAIL\]/g, answers.email);
      };

      // Update PR Template
      if (fileExists(prTemplatePath)) {
        let content = await readFile(prTemplatePath);
        content = replacePlaceholders(content);
        await writeFile(prTemplatePath, content);
      }

      // Update Issue Templates (if directory exists)
      try {
        if (fileExists(issueTemplatePath)) {
          const files = await readdir(issueTemplatePath);
          for (const file of files) {
            const filePath = path.join(issueTemplatePath, file);
            let content = await readFile(filePath);
            content = replacePlaceholders(content);
            await writeFile(filePath, content);
          }
        }
      } catch {
        // Ignore errors if directory doesn't exist or can't be read
      }
    }

    // DevTools
    // DevTools - Pre-commit hooks
    if (!answers.preCommitHooks) {
      await deleteDirectory(path.join(projectPath, '.husky'));
      await deleteFile(path.join(projectPath, 'commitlint.config.mjs'));
      await deleteFile(path.join(projectPath, '.lintstagedrc.mjs'));

      // Remove scripts and deps
      await updateJson(path.join(projectPath, 'package.json'), (pkg) => {
        delete pkg.devDependencies['husky'];
        delete pkg.devDependencies['@commitlint/cli'];
        delete pkg.devDependencies['@commitlint/config-conventional'];
        delete pkg.devDependencies['lint-staged'];
        delete pkg.scripts['prepare'];
        delete pkg.scripts['postinstall']; // Often used for husky install
        delete pkg.commitlint;
        delete pkg['lint-staged'];
        return pkg;
      });
    }

    // DevTools - Commitizen
    if (!answers.commitizen) {
      await deleteFile(path.join(projectPath, '.czrc'));

      // Remove scripts and deps
      await updateJson(path.join(projectPath, 'package.json'), (pkg) => {
        delete pkg.devDependencies['commitizen'];
        delete pkg.devDependencies['cz-conventional-changelog'];
        delete pkg.config?.commitizen;
        if (pkg.config && Object.keys(pkg.config).length === 0) {
          delete pkg.config;
        }
        delete pkg.scripts['commit'];
        return pkg;
      });
    }

    // 4. Initialize Git
    spinner.text = 'Initializing Git...';
    await initializeGit(projectPath);
    if (answers.gitRemote) {
      await addRemote(projectPath, answers.gitRemote);
    }

    // 5. Install Dependencies
    spinner.text = 'Installing dependencies...';
    await installDependencies(projectPath, answers.packageManager);

    // 6. Format and Lint
    spinner.text = 'Formatting and Linting...';
    await runScript(projectPath, answers.packageManager, 'format');
    await runScript(projectPath, answers.packageManager, 'lint:fix');

    spinner.succeed(pc.green(`Project ${answers.projectName} created successfully!`));
    log('');
    log('To get started:');
    log(pc.cyan(`  cd ${answers.projectName}`));
    log(
      pc.cyan(
        `  ${answers.packageManager === 'npm' ? 'npm run dev' : answers.packageManager + ' dev'}`,
      ),
    );
    log('');
  } catch (err) {
    spinner.fail('Failed to create project.');
    console.error(err);
    // Cleanup: Delete the created directory if it exists
    if (fileExists(projectPath)) {
      spinner.text = 'Cleaning up...';
      try {
        await deleteDirectory(projectPath);
        console.log(pc.yellow(`\nCleaned up: Deleted directory ${answers.projectName}`));
      } catch (cleanupErr) {
        console.error(pc.red(`\nFailed to clean up directory ${answers.projectName}:`), cleanupErr);
      }
    }
    process.exit(1);
  }
};
