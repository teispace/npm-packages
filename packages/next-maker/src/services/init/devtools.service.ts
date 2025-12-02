import path from 'node:path';
import { readdir } from 'node:fs/promises';
import {
  deleteDirectory,
  deleteFile,
  fileExists,
  readFile,
  updateJson,
  writeFile,
} from '../../core/files';
import { ProjectPrompts } from '../../prompts/create-app.prompt';
import { PROJECT_PATHS } from '../../config/paths';
import { PACKAGES } from '../../config/packages';

export const setupDevTools = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  await setupPreCommitHooks(projectPath, answers);
  await setupCommitizen(projectPath, answers);
  await setupCiCd(projectPath, answers);
  await setupGithubTemplates(projectPath, answers);
  await setupCommunityFiles(projectPath, answers);
  await setupDocker(projectPath, answers);
  await setupReadme(projectPath, answers);
};

const setupPreCommitHooks = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.preCommitHooks) {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.HUSKY_DIR));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.COMMITLINT_CONFIG));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.LINTSTAGED_RC));

    await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
      delete pkg.devDependencies[PACKAGES.HUSKY];
      delete pkg.devDependencies[PACKAGES.COMMITLINT_CLI];
      delete pkg.devDependencies[PACKAGES.COMMITLINT_CONFIG];
      delete pkg.devDependencies[PACKAGES.LINT_STAGED];
      delete pkg.scripts['prepare'];
      delete pkg.scripts['postinstall'];
      delete pkg.commitlint;
      delete pkg['lint-staged'];
      return pkg;
    });
  }
};

const setupCommitizen = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.commitizen) {
    await deleteFile(path.join(projectPath, PROJECT_PATHS.CZRC));

    await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
      delete pkg.devDependencies[PACKAGES.COMMITIZEN];
      delete pkg.devDependencies[PACKAGES.CZ_CONVENTIONAL_CHANGELOG];
      delete pkg.config?.commitizen;
      if (pkg.config && Object.keys(pkg.config).length === 0) {
        delete pkg.config;
      }
      delete pkg.scripts['commit'];
      return pkg;
    });
  }
};

const setupCiCd = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.ci) {
    await deleteDirectory(path.join(projectPath, PROJECT_PATHS.GITHUB_WORKFLOWS));
  }
};

const setupGithubTemplates = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const githubPath = path.join(projectPath, PROJECT_PATHS.GITHUB_DIR);
  if (!answers.keepTemplates) {
    await deleteDirectory(path.join(githubPath, PROJECT_PATHS.GITHUB_ISSUE_TEMPLATE));
    await deleteFile(path.join(githubPath, PROJECT_PATHS.GITHUB_PR_TEMPLATE));
  } else {
    const issueTemplatePath = path.join(githubPath, PROJECT_PATHS.GITHUB_ISSUE_TEMPLATE);
    const prTemplatePath = path.join(githubPath, PROJECT_PATHS.GITHUB_PR_TEMPLATE);

    const replacePlaceholders = (content: string) => {
      return content
        .replace(/Teispace/g, answers.company)
        .replace(/support@teispace\.com/g, answers.email)
        .replace(/Next\.js Starter/g, answers.projectName)
        .replace(/\[AUTHOR\]/g, answers.author)
        .replace(/\[COMPANY\]/g, answers.company)
        .replace(/\[EMAIL\]/g, answers.email);
    };

    if (fileExists(prTemplatePath)) {
      let content = await readFile(prTemplatePath);
      content = replacePlaceholders(content);
      await writeFile(prTemplatePath, content);
    }

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
      // Ignore
    }
  }
};

const setupCommunityFiles = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  const allCommunityFiles = [
    PROJECT_PATHS.CODE_OF_CONDUCT,
    PROJECT_PATHS.CONTRIBUTING,
    PROJECT_PATHS.SECURITY,
  ];
  for (const file of allCommunityFiles) {
    if (!answers.communityFiles.includes(file)) {
      await deleteFile(path.join(projectPath, file));
    }
  }
};

const setupDocker = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
  if (!answers.docker) {
    await deleteFile(path.join(projectPath, PROJECT_PATHS.DOCKERFILE));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.DOCKER_COMPOSE));
    await deleteFile(path.join(projectPath, PROJECT_PATHS.DOCKERIGNORE));

    const envPath = path.join(projectPath, PROJECT_PATHS.ENV_EXAMPLE);
    if (fileExists(envPath)) {
      let envContent = await readFile(envPath);
      envContent = envContent.replace(/# Docker Compose Configuration\n/, '');
      envContent = envContent.replace(/CONTAINER_NAME=.*\n/, '');
      envContent = envContent.replace(/IMAGE_NAME=.*\n/, '');
      envContent = envContent.replace(/IMAGE_TAG=.*\n/, '');
      await writeFile(envPath, envContent);
    }
  } else {
    const envPath = path.join(projectPath, PROJECT_PATHS.ENV_EXAMPLE);
    if (fileExists(envPath)) {
      let envContent = await readFile(envPath);
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
};

const setupReadme = async (projectPath: string, answers: ProjectPrompts): Promise<void> => {
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
  const rootReadmePath = path.join(projectPath, PROJECT_PATHS.README);

  for (const readmePath of allReadmes) {
    if (readmePath !== rootReadmePath) {
      await deleteFile(readmePath);
    }
  }

  if (answers.readme) {
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
    await deleteFile(rootReadmePath);
  }
};
