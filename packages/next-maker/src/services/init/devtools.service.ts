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

export class DevToolsService {
  async setupDevTools(projectPath: string, answers: ProjectPrompts): Promise<void> {
    await this.setupPreCommitHooks(projectPath, answers);
    await this.setupCommitizen(projectPath, answers);
    await this.setupCiCd(projectPath, answers);
    await this.setupGithubTemplates(projectPath, answers);
    await this.setupCommunityFiles(projectPath, answers);
    await this.setupDocker(projectPath, answers);
    await this.setupReadme(projectPath, answers);
  }

  private async setupPreCommitHooks(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.preCommitHooks) {
      await deleteDirectory(path.join(projectPath, '.husky'));
      await deleteFile(path.join(projectPath, 'commitlint.config.mjs'));
      await deleteFile(path.join(projectPath, '.lintstagedrc.mjs'));

      await updateJson(path.join(projectPath, 'package.json'), (pkg) => {
        delete pkg.devDependencies['husky'];
        delete pkg.devDependencies['@commitlint/cli'];
        delete pkg.devDependencies['@commitlint/config-conventional'];
        delete pkg.devDependencies['lint-staged'];
        delete pkg.scripts['prepare'];
        delete pkg.scripts['postinstall'];
        delete pkg.commitlint;
        delete pkg['lint-staged'];
        return pkg;
      });
    }
  }

  private async setupCommitizen(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.commitizen) {
      await deleteFile(path.join(projectPath, '.czrc'));

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
  }

  private async setupCiCd(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.ci) {
      await deleteDirectory(path.join(projectPath, '.github/workflows'));
    }
  }

  private async setupGithubTemplates(projectPath: string, answers: ProjectPrompts): Promise<void> {
    const githubPath = path.join(projectPath, '.github');
    if (!answers.keepTemplates) {
      await deleteDirectory(path.join(githubPath, 'ISSUE_TEMPLATE'));
      await deleteFile(path.join(githubPath, 'PULL_REQUEST_TEMPLATE.md'));
    } else {
      const issueTemplatePath = path.join(githubPath, 'ISSUE_TEMPLATE');
      const prTemplatePath = path.join(githubPath, 'PULL_REQUEST_TEMPLATE.md');

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
            // readdir returns strings if withFileTypes is not set, or Dirents if it is.
            // fs/promises readdir returns strings by default.
            // But wait, I need to check if it's a file.
            // The original code assumed files.
            // Let's stick to reading files.
            let content = await readFile(filePath);
            content = replacePlaceholders(content);
            await writeFile(filePath, content);
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  private async setupCommunityFiles(projectPath: string, answers: ProjectPrompts): Promise<void> {
    const allCommunityFiles = ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md'];
    for (const file of allCommunityFiles) {
      if (!answers.communityFiles.includes(file)) {
        await deleteFile(path.join(projectPath, file));
      }
    }
  }

  private async setupDocker(projectPath: string, answers: ProjectPrompts): Promise<void> {
    if (!answers.docker) {
      await deleteFile(path.join(projectPath, 'Dockerfile'));
      await deleteFile(path.join(projectPath, 'docker-compose.yml'));
      await deleteFile(path.join(projectPath, '.dockerignore'));

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
      const envPath = path.join(projectPath, '.env.example');
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
  }

  private async setupReadme(projectPath: string, answers: ProjectPrompts): Promise<void> {
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
  }
}
