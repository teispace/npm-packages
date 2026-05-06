import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const exists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolve the App Router directory for metadata files.
 * Prefers `src/app`, falls back to `app`. Returns absolute path.
 */
export const detectAppDir = async (projectPath: string): Promise<string | null> => {
  const candidates = [path.join(projectPath, 'src', 'app'), path.join(projectPath, 'app')];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
};

export interface PwaDetection {
  isPwa: boolean;
  /** Path to a static manifest file (json/webmanifest) if present in /public. */
  publicManifestPath?: string;
  /** Path to a typed `manifest.ts`/`manifest.tsx` in app dir if present. */
  appManifestPath?: string;
  /** Detected PWA framework, if any. */
  framework?: 'next-pwa' | '@ducanh2912/next-pwa' | '@serwist/next' | 'serwist';
}

const PWA_PACKAGES = ['next-pwa', '@ducanh2912/next-pwa', '@serwist/next', 'serwist'] as const;

export const detectPwa = async (projectPath: string): Promise<PwaDetection> => {
  const result: PwaDetection = { isPwa: false };

  // Static manifest in /public
  const publicCandidates = [
    path.join(projectPath, 'public', 'manifest.json'),
    path.join(projectPath, 'public', 'manifest.webmanifest'),
    path.join(projectPath, 'public', 'site.webmanifest'),
  ];
  for (const p of publicCandidates) {
    if (await exists(p)) {
      result.publicManifestPath = p;
      result.isPwa = true;
      break;
    }
  }

  // Typed manifest in app dir
  const appDir = await detectAppDir(projectPath);
  if (appDir) {
    for (const ext of ['ts', 'tsx', 'js']) {
      const candidate = path.join(appDir, `manifest.${ext}`);
      if (await exists(candidate)) {
        result.appManifestPath = candidate;
        result.isPwa = true;
        break;
      }
    }
  }

  // Package-based detection
  try {
    const pkg = JSON.parse(await readFile(path.join(projectPath, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    for (const name of PWA_PACKAGES) {
      if (deps[name]) {
        result.framework = name;
        result.isPwa = true;
        break;
      }
    }
  } catch {
    /* no package.json — skip */
  }

  return result;
};
