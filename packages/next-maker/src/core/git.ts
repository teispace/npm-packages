import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Run a git command with argv passed as an array (no shell). This is the
 * security-critical detail: a shell string like
 * `git remote add origin ${gitRemote}` lets a value such as
 * `x; rm -rf $HOME` execute arbitrary commands. `execFile` with argv never
 * invokes a shell, so user-supplied values are inert data.
 */
const git = (args: string[], cwd?: string) => execFileAsync('git', args, cwd ? { cwd } : undefined);

/**
 * Validate a git remote URL/spec before use. Even though argv form already
 * neutralizes injection, we reject obviously malformed values (and a leading
 * `-` that git would treat as an option) for clear, early errors.
 */
export function assertValidRemote(remote: string): void {
  const value = remote.trim();
  if (!value || value.startsWith('-')) {
    throw new Error(`Invalid git remote "${remote}".`);
  }
  const ok =
    /^https?:\/\/\S+$/.test(value) || // https URL
    /^git@[\w.-]+:\S+$/.test(value) || // scp-style ssh
    /^ssh:\/\/\S+$/.test(value) || // ssh URL
    /^[\w.-]+\/[\w.-]+$/.test(value); // owner/repo shorthand
  if (!ok) {
    throw new Error(`Invalid git remote "${remote}". Expected an https/ssh URL or "owner/repo".`);
  }
}

export const initializeGit = async (
  cwd: string,
  gitRemote?: string,
  pushToRemote?: boolean,
): Promise<void> => {
  try {
    await git(['init'], cwd);
    await git(['add', '.'], cwd);
    await git(['commit', '-m', 'Initial commit from @teispace/next-maker'], cwd);

    if (gitRemote) {
      assertValidRemote(gitRemote);
      await git(['remote', 'add', 'origin', gitRemote], cwd);
      if (pushToRemote) {
        await git(['fetch', 'origin'], cwd);

        let remoteBranch = 'main';
        try {
          await git(['show-branch', 'origin/main'], cwd);
        } catch {
          try {
            await git(['show-branch', 'origin/master'], cwd);
            remoteBranch = 'master';
          } catch {
            // Neither exists; default to main and let a later push surface it.
            remoteBranch = 'main';
          }
        }

        await git(
          ['merge', `origin/${remoteBranch}`, '--allow-unrelated-histories', '-X', 'ours'],
          cwd,
        );
        await git(['push', 'origin', `HEAD:${remoteBranch}`], cwd);
      }
    }
  } catch (error) {
    // Ignore error if git is not installed or fails.
    console.warn('Failed to initialize git repository', error);
  }
};

export const addRemote = async (cwd: string, url: string): Promise<void> => {
  try {
    assertValidRemote(url);
    await git(['remote', 'add', 'origin', url], cwd);
  } catch (error) {
    console.warn('Failed to add remote origin', error);
  }
};

export const isGitInstalled = async (): Promise<boolean> => {
  try {
    await git(['--version']);
    return true;
  } catch {
    return false;
  }
};
