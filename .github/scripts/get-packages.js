#!/usr/bin/env node

/**
 * Script to discover all packages in the packages/ directory
 * Used by GitHub Actions to dynamically handle multiple packages
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function getPackages() {
  try {
    const packagesDir = join(process.cwd(), 'packages');
    const entries = await readdir(packagesDir, { withFileTypes: true });

    const packages = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const packageJsonPath = join(packagesDir, entry.name, 'package.json');
        try {
          const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonContent);

          // Skip private packages
          if (packageJson.private) {
            continue;
          }

          packages.push({
            path: `packages/${entry.name}`,
            name: packageJson.name,
            version: packageJson.version,
            component: entry.name,
            outputKey: `packages/${entry.name}`,
          });
        } catch {
          // Skip directories without package.json
          console.warn(`Warning: No package.json found in packages/${entry.name}`);
        }
      }
    }

    return packages;
  } catch (error) {
    console.error('Error reading packages:', error);
    process.exit(1);
  }
}

// Execute and output as JSON
getPackages().then((packages) => {
  console.log(JSON.stringify(packages, null, 2));
});
