import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Answers, StarterManifest } from '../../composition/manifest';
import { runCommand } from '../../composition/package-manager';
import { PROJECT_PATHS } from '../../config/paths';
import { deleteFile, fileExists, readFile, writeFile } from '../../core/files';
import type { PackageManager } from '../../core/package-manager';
import type { ProjectIdentity } from '../../prompts/create-app.prompt';

export {
  PROJECT_RECORD_FILE,
  type ProjectRecord,
  readProjectRecord,
  writeProjectRecord,
} from '../../composition/project';

const replacePlaceholders = (content: string, identity: ProjectIdentity): string =>
  content
    .replace(/support@teispace\.com/g, identity.email)
    .replace(/Next\.js Starter/g, identity.projectName)
    .replace(/\[AUTHOR\]/g, identity.author)
    .replace(/\[COMPANY\]/g, identity.author)
    .replace(/\[EMAIL\]/g, identity.email);

/** Personalise the GitHub templates and community files that survived composition. */
export const personaliseTemplates = async (
  projectPath: string,
  identity: ProjectIdentity,
): Promise<void> => {
  const candidates = [
    path.join(projectPath, PROJECT_PATHS.GITHUB_DIR, PROJECT_PATHS.GITHUB_PR_TEMPLATE),
    path.join(projectPath, PROJECT_PATHS.CODE_OF_CONDUCT),
    path.join(projectPath, PROJECT_PATHS.CONTRIBUTING),
    path.join(projectPath, PROJECT_PATHS.SECURITY),
  ];
  const issueDir = path.join(
    projectPath,
    PROJECT_PATHS.GITHUB_DIR,
    PROJECT_PATHS.GITHUB_ISSUE_TEMPLATE,
  );
  if (fileExists(issueDir)) {
    for (const file of await readdir(issueDir)) candidates.push(path.join(issueDir, file));
  }
  for (const file of candidates) {
    if (!fileExists(file)) continue;
    const content = await readFile(file);
    const next = replacePlaceholders(content, identity);
    if (next !== content) await writeFile(file, next);
  }
};

/** Point the compose defaults at the project name. */
export const personaliseDockerEnv = async (
  projectPath: string,
  identity: ProjectIdentity,
): Promise<void> => {
  const envPath = path.join(projectPath, PROJECT_PATHS.ENV_EXAMPLE);
  if (!fileExists(envPath)) return;
  let content = await readFile(envPath);
  content = content.replace(
    /^CONTAINER_NAME=.*$/m,
    `CONTAINER_NAME=${identity.projectName} # -public`,
  );
  content = content.replace(/^IMAGE_NAME=.*$/m, `IMAGE_NAME=${identity.projectName} # -public`);
  await writeFile(envPath, content);
};

const describeOption = (manifest: StarterManifest, name: string, value: unknown): string | null => {
  const spec = manifest.options[name];
  if (!spec) return null;
  const label = spec.label ?? name;
  if (spec.type === 'boolean') return value ? label : null;
  if (Array.isArray(value)) return value.length ? `${label}: ${value.join(', ')}` : null;
  if (value === 'none') return null;
  return `${label}: ${String(value)}`;
};

/** Replace the starter README (which documents the starter) with one for this project. */
export const writeProjectReadme = async (
  projectPath: string,
  identity: ProjectIdentity,
  manifest: StarterManifest,
  answers: Answers,
  packageManager: PackageManager,
): Promise<void> => {
  const rootReadme = path.join(projectPath, PROJECT_PATHS.README);
  if (!identity.readme) {
    await deleteFile(rootReadme);
    return;
  }
  const features = Object.entries(answers)
    .filter(([name]) => name !== 'packageManager')
    .map(([name, value]) => describeOption(manifest, name, value))
    .filter((line): line is string => line !== null);

  const scripts: [string, string][] = [
    ['dev', 'development server'],
    ['build', 'production build'],
    ['start', 'serve the production build'],
    ['lint:fix', 'lint, format, and sort imports'],
    ['type-check', 'route types + tsc'],
    ['check:deprecated', 'fail on deprecated API usage'],
    ['validate', 'every gate CI runs'],
  ];
  if (answers.tests) scripts.push(['test', 'unit and component tests']);
  if (answers.e2e) scripts.push(['test:e2e', 'Playwright against a production build']);

  const content = `# ${identity.projectName}

${identity.description}

Generated from [@teispace/nextjs-starter](https://github.com/teispace/nextjs-starter) ${manifest.starter.version} with \`@teispace/next-maker\`.

## Getting started

\`\`\`bash
${packageManager} install
${runCommand(packageManager, 'dev')}
\`\`\`

Open [http://localhost:3000](http://localhost:3000). Copy \`.env.example\` to \`.env\` and set \`NEXT_PUBLIC_API_URL\` to your API origin. Production builds also need \`NEXT_PUBLIC_APP_URL\`, the public URL of this app.

## What is included

${features.map((f) => `- ${f}`).join('\n')}

## Scripts

| Script | Purpose |
| :-- | :-- |
${scripts.map(([name, purpose]) => `| \`${runCommand(packageManager, name)}\` | ${purpose} |`).join('\n')}

## Guides

- \`AGENTS.md\`: conventions and stack decisions (also read by coding agents)
- \`docs/data-layer.md\`: how reads, mutations, caching, and sessions fit together
- \`src/features/README.md\`: how to add a feature
- \`src/lib/http/README.md\`: the HTTP client
${answers.ws ? '- `src/lib/ws/README.md`: the WebSocket client\n' : ''}${answers.i18n ? '- `src/i18n/README.md`: internationalization\n' : ''}- \`docs/ui-libraries.md\`: adding shadcn/ui, Radix, MUI, Mantine, or HeroUI

Generators: \`npx @teispace/next-maker feature <name>\`, \`page <name>\`, \`component <name>\`, \`env <NAME>\`${answers.i18n ? ', `locale <code>`' : ''}.
`;
  await writeFile(rootReadme, content);
};
