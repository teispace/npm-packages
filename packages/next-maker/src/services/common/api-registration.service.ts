import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../../config/utils';

interface RegisterApiOptions {
  serviceName: string;
  projectPath: string;
}

export const registerApiEndpoints = async (options: RegisterApiOptions): Promise<void> => {
  const { serviceName, projectPath } = options;
  const camelName = kebabToCamel(serviceName);
  const apiConfigPath = path.join(projectPath, 'src', 'lib', 'config', 'app-apis.ts');

  try {
    // Read the current app-apis.ts file
    const content = await readFile(apiConfigPath, 'utf-8');

    // Check if the service already exists in the file
    if (content.includes(`${camelName}:`)) {
      // Service already registered, skip
      return;
    }

    // Find the position to insert the new API endpoint
    // Looking for the closing brace of AppApis object
    const appApisMatch = content.match(/export const AppApis = \{[\s\S]*?\} as const;/);

    if (!appApisMatch) {
      throw new Error('Could not find AppApis object in app-apis.ts');
    }

    // Create the new API endpoint entry
    const newEndpoint = `  ${camelName}: {
    base: \`\${API_PREFIX}/${serviceName}\`,
    getAll: \`\${API_PREFIX}/${serviceName}\`,
  },`;

    // Find the position before the closing brace
    const closingBracePattern = /(\s*)\} as const;/;
    const match = content.match(closingBracePattern);

    if (!match) {
      throw new Error('Could not find closing brace of AppApis object');
    }

    // Insert the new endpoint before the closing brace
    const insertPosition = content.lastIndexOf('} as const;');
    const beforeClosing = content.substring(0, insertPosition);
    const afterClosing = content.substring(insertPosition);

    // Check if there's already content in AppApis
    const hasExistingEndpoints = beforeClosing.trim().endsWith(',');
    const needsComma = beforeClosing.match(/:\s*\{[^}]*\},\s*$/);

    let updatedContent: string;
    if (needsComma || hasExistingEndpoints) {
      // There are existing endpoints, add comma and new endpoint
      updatedContent = `${beforeClosing}\n${newEndpoint}\n${afterClosing}`;
    } else {
      // First endpoint after auth (or empty object), just add it
      updatedContent = beforeClosing.trimEnd() + '\n' + newEndpoint + '\n' + afterClosing;
    }

    // Write the updated content back
    await writeFile(apiConfigPath, updatedContent);
  } catch (error) {
    throw new Error(`Failed to register API endpoints: ${error}`);
  }
};
