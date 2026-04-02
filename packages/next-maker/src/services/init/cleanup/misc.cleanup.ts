import path from 'node:path';
import { deleteDirectory, deleteFile } from '../../../core/files';
import { PROJECT_PATHS } from '../../../config/paths';
import type { ProjectPrompts } from '../../../prompts/create-app.prompt';

export const cleanupSecureStorage = async (
  projectPath: string,
  answers: ProjectPrompts,
): Promise<void> => {
  const keepSecureStorage = answers.httpClient !== 'none' || answers.reactSecureStorage;
  if (!keepSecureStorage) {
    await deleteFile(path.join(projectPath, PROJECT_PATHS.STORAGE_SERVICE));
  }
};

export const cleanupLicense = async (projectPath: string): Promise<void> => {
  await deleteFile(path.join(projectPath, PROJECT_PATHS.LICENSE));
};

export const cleanupChangelog = async (projectPath: string): Promise<void> => {
  await deleteFile(path.join(projectPath, PROJECT_PATHS.CHANGELOG));
};

export const cleanupConfig = async (projectPath: string): Promise<void> => {
  await deleteFile(path.join(projectPath, PROJECT_PATHS.NVM_RC));
  await deleteFile(path.join(projectPath, PROJECT_PATHS.NPM_RC));
};

/**
 * Remove template-specific directories that should not ship in generated projects.
 * - .claude/ — Claude Code workspace config from the starter template
 * - docs/ — Starter template documentation (structure.md etc.)
 * - .vscode/ — IDE-specific settings from the starter
 */
export const cleanupTemplateArtifacts = async (projectPath: string): Promise<void> => {
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.CLAUDE_DIR));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.DOCS_DIR));
  await deleteDirectory(path.join(projectPath, PROJECT_PATHS.VSCODE_DIR));
};
