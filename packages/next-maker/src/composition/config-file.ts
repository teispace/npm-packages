import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * `init --config <file>`: a JSON document with the identity fields and the
 * option answers, for repeatable, non-interactive project creation.
 *
 * ```json
 * {
 *   "name": "my-app",
 *   "description": "...",
 *   "author": "...",
 *   "packageManager": "pnpm",
 *   "preset": "full",
 *   "options": { "i18n": false }
 * }
 * ```
 */
export interface InitConfigFile {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  email?: string;
  gitRemote?: string;
  packageManager?: string;
  preset?: string;
  options?: Record<string, unknown>;
  install?: boolean;
  git?: boolean;
  copyEnv?: boolean;
  readme?: boolean;
}

export const loadInitConfig = async (file: string): Promise<InitConfigFile> => {
  const abs = path.resolve(process.cwd(), file);
  let raw: string;
  try {
    raw = await readFile(abs, 'utf-8');
  } catch {
    throw new Error(`Config file not found: ${abs}`);
  }
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file ${abs} must contain a JSON object`);
  }
  if (
    parsed.options !== undefined &&
    (typeof parsed.options !== 'object' || parsed.options === null)
  ) {
    throw new Error(`Config file ${abs}: "options" must be an object`);
  }
  return parsed as InitConfigFile;
};

/** Parse repeated `--set key=value` flags. */
export const parseSetFlags = (values: string[] | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const entry of values ?? []) {
    const eq = entry.indexOf('=');
    if (eq <= 0) throw new Error(`--set expects key=value, got "${entry}"`);
    out[entry.slice(0, eq).trim()] = entry.slice(eq + 1).trim();
  }
  return out;
};
