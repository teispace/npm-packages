import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const getTemplatePath = (): string => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'Templates', 'nextjs-starter');
};

const checkIfDarkThemeExists = async (projectPath: string): Promise<boolean> => {
  const themeProviderPath = path.join(projectPath, 'src', 'providers', 'CustomThemeProvider.tsx');
  try {
    await access(themeProviderPath);
    return true;
  } catch {
    return false;
  }
};

export const setupDarkTheme = async (projectPath: string): Promise<boolean> => {
  const exists = await checkIfDarkThemeExists(projectPath);

  if (exists) {
    return false; // Already exists, nothing installed
  }

  const templatePath = getTemplatePath();

  // Copy CustomThemeProvider.tsx
  const themeProviderTemplatePath = path.join(
    templatePath,
    'src',
    'providers',
    'CustomThemeProvider.tsx',
  );
  const themeProviderProjectPath = path.join(
    projectPath,
    'src',
    'providers',
    'CustomThemeProvider.tsx',
  );

  const themeProviderContent = await readFile(themeProviderTemplatePath, 'utf-8');
  await writeFile(themeProviderProjectPath, themeProviderContent);

  // Update styles/globals.css to add dark/light color variables
  await updateGlobalStyles(projectPath);

  // Update layout.tsx to add bg-light dark:bg-dark classes
  await updateLayoutClasses(projectPath);

  // Update providers/index.ts to export CustomThemeProvider
  await updateProvidersIndex(projectPath);

  // Update RootProvider to include CustomThemeProvider
  await updateRootProvider(projectPath);

  return true; // Successfully installed
};

const updateProvidersIndex = async (projectPath: string): Promise<void> => {
  const indexPath = path.join(projectPath, 'src', 'providers', 'index.ts');

  try {
    let content = await readFile(indexPath, 'utf-8');

    // Check if CustomThemeProvider is already exported
    if (content.includes('CustomThemeProvider')) {
      return;
    }

    // Add export for CustomThemeProvider
    content += "\nexport { CustomThemeProvider } from './CustomThemeProvider';\n";

    await writeFile(indexPath, content);
  } catch {
    // If index.ts doesn't exist, create it
    const content = `export { CustomThemeProvider } from './CustomThemeProvider';
export { RootProvider } from './RootProvider';
export { StoreProvider } from './StoreProvider';
`;
    await writeFile(indexPath, content);
  }
};

const updateRootProvider = async (projectPath: string): Promise<void> => {
  const rootProviderPath = path.join(projectPath, 'src', 'providers', 'RootProvider.tsx');

  try {
    let content = await readFile(rootProviderPath, 'utf-8');

    // Check if CustomThemeProvider is already in use
    if (content.includes('CustomThemeProvider')) {
      return;
    }

    // Update import to include CustomThemeProvider
    if (content.includes("import { StoreProvider } from '@/providers';")) {
      content = content.replace(
        "import { StoreProvider } from '@/providers';",
        "import { CustomThemeProvider, StoreProvider } from '@/providers';",
      );
    } else if (content.includes('import {')) {
      // Find the import statement and add CustomThemeProvider
      content = content.replace(
        /import \{([^}]+)\} from '@\/providers';/,
        "import { CustomThemeProvider, $1 } from '@/providers';",
      );
    } else {
      // Add new import
      const firstImportIndex = content.indexOf('import');
      if (firstImportIndex !== -1) {
        const nextLineIndex = content.indexOf('\n', firstImportIndex);
        content =
          content.slice(0, nextLineIndex + 1) +
          "import { CustomThemeProvider } from '@/providers';\n" +
          content.slice(nextLineIndex + 1);
      }
    }

    // Wrap children with CustomThemeProvider
    // Find the return statement and wrap appropriately
    if (content.includes('<StoreProvider>')) {
      content = content.replace(/(<StoreProvider>)/, `$1\n      <CustomThemeProvider>`);
      content = content.replace(/(<\/StoreProvider>)/, `      </CustomThemeProvider>\n    $1`);
    } else {
      // If no StoreProvider, wrap the children directly
      content = content.replace(/(return\s*\(\s*<[^>]+>)/, `$1\n    <CustomThemeProvider>`);
      content = content.replace(/(<\/[^>]+>\s*\);)/, `    </CustomThemeProvider>\n  $1`);
    }

    await writeFile(rootProviderPath, content);
  } catch (error) {
    throw new Error(`Failed to update RootProvider: ${error}`);
  }
};

export const isDarkThemeSetup = async (projectPath: string): Promise<boolean> => {
  return await checkIfDarkThemeExists(projectPath);
};

const updateGlobalStyles = async (projectPath: string): Promise<void> => {
  const stylesPath = path.join(projectPath, 'src', 'styles', 'globals.css');

  try {
    let content = await readFile(stylesPath, 'utf-8');

    // Check if dark theme setup is already complete
    if (
      content.includes('@custom-variant dark') &&
      content.includes('--color-dark') &&
      content.includes('--color-light')
    ) {
      return;
    }

    // Add @custom-variant dark if not present
    if (!content.includes('@custom-variant dark')) {
      // Add after @import 'tailwindcss'; if it exists
      if (content.includes("@import 'tailwindcss';")) {
        content = content.replace(
          "@import 'tailwindcss';",
          "@import 'tailwindcss';\n\n@custom-variant dark (&:where(.dark, .dark *));",
        );
      } else {
        // Add at the beginning
        content = '@custom-variant dark (&:where(.dark, .dark *));\n\n' + content;
      }
    }

    // Check if @theme block exists
    if (content.includes('@theme')) {
      // Add colors to existing @theme block if not present
      if (!content.includes('--color-dark')) {
        content = content.replace(
          /(@theme\s*{[^}]*)(})/,
          '$1  --color-dark: #202938;\n  --color-light: #f5f5f5;\n$2',
        );
      }
    } else {
      // Add @theme block at the end
      content += `\n@theme {\n  --color-dark: #202938;\n  --color-light: #f5f5f5;\n}\n`;
    }

    await writeFile(stylesPath, content);
  } catch {
    // If globals.css doesn't exist or error reading, skip
  }
};

const updateLayoutClasses = async (projectPath: string): Promise<void> => {
  // Try to find layout.tsx in common locations
  const layoutPaths = [
    path.join(projectPath, 'src', 'app', 'layout.tsx'),
    path.join(projectPath, 'src', 'app', '[locale]', 'layout.tsx'),
  ];

  for (const layoutPath of layoutPaths) {
    try {
      let content = await readFile(layoutPath, 'utf-8');

      // Check if dark:bg-dark already exists
      if (content.includes('dark:bg-dark')) {
        continue;
      }

      // Update body className to include bg-light dark:bg-dark
      // Match various className patterns
      content = content.replace(
        /<body([^>]*?)className={`([^`]*)`}([^>]*)>/,
        (match, before, classes, after) => {
          // Add bg-light dark:bg-dark if not present
          let updatedClasses = classes;
          if (!updatedClasses.includes('bg-light')) {
            updatedClasses = updatedClasses.trim() + ' bg-light dark:bg-dark';
          }
          return `<body${before}className={\`${updatedClasses}\`}${after}>`;
        },
      );

      // Handle simple className="..." pattern
      content = content.replace(
        /<body([^>]*?)className="([^"]*)"([^>]*)>/,
        (match, before, classes, after) => {
          let updatedClasses = classes;
          if (!updatedClasses.includes('bg-light')) {
            updatedClasses = updatedClasses.trim() + ' bg-light dark:bg-dark';
          }
          return `<body${before}className="${updatedClasses}"${after}>`;
        },
      );

      await writeFile(layoutPath, content);
    } catch {
      // File doesn't exist or error reading, continue to next
    }
  }
};

export const getDarkThemePackages = (): string[] => {
  return ['next-themes'];
};
