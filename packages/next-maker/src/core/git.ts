import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const initializeGit = async (cwd: string, gitRemote?: string): Promise<void> => {
  try {
    // Initialize git repository
    await execAsync('git init', { cwd });
    await execAsync('git add .', { cwd });
    await execAsync('git commit -m "Initial commit from @teispace/next-maker"', { cwd });

    // Add remote origin if GitHub URL is provided
    if (gitRemote) {
      await execAsync(`git remote add origin ${gitRemote}`, { cwd });
      await execAsync(`git fetch origin`, { cwd });
      await execAsync(`git merge origin/main --allow-unrelated-histories`, { cwd });
      await execAsync(`git push origin HEAD:main`, { cwd });
    }
  } catch (error) {
    // Ignore error if git is not installed or fails
    console.warn('Failed to initialize git repository', error);
  }
};

export const addRemote = async (cwd: string, url: string): Promise<void> => {
  try {
    await execAsync(`git remote add origin ${url}`, { cwd });
  } catch (error) {
    console.warn('Failed to add remote origin', error);
  }
};

export const isGitInstalled = async (): Promise<boolean> => {
  try {
    await execAsync('git --version');
    return true;
  } catch {
    return false;
  }
};
