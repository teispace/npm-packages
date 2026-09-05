import path from 'node:path';
import { PROJECT_PATHS } from '../../config/paths';
import { updateJson } from '../../core/files';
import type { ProjectIdentity } from '../../prompts/create-app.prompt';

const githubUrls = (identity: ProjectIdentity) => {
  let remote = identity.gitRemote;
  let homepage = identity.gitHomepage;
  let issues = identity.gitIssues;
  if (!remote) return { remote: '', homepage: '', issues: '' };
  if (remote.startsWith('git@github.com:')) {
    remote = remote.replace('git@github.com:', 'https://github.com/').replace(/\.git$/, '');
  }
  const base = remote.replace(/\.git$/, '');
  homepage ||= `${base}#readme`;
  issues ||= `${base}/issues`;
  if (!remote.endsWith('.git')) remote = `${remote}.git`;
  return { remote, homepage, issues };
};

/** Stamp the project identity onto the starter's package.json. */
export const configurePackageJson = async (
  projectPath: string,
  identity: ProjectIdentity,
): Promise<void> => {
  const { remote, homepage, issues } = githubUrls(identity);
  await updateJson(path.join(projectPath, PROJECT_PATHS.PACKAGE_JSON), (pkg) => {
    pkg.name = identity.projectName;
    pkg.version = identity.version;
    pkg.description = identity.description;
    pkg.author = identity.author;
    delete pkg.keywords;
    if (remote) {
      pkg.homepage = homepage;
      pkg.bugs = { url: issues };
      pkg.repository = { type: 'git', url: remote };
    } else {
      delete pkg.homepage;
      delete pkg.bugs;
      delete pkg.repository;
    }
    return pkg;
  });
};
