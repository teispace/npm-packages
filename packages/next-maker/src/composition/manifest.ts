import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The starter's `next-maker.json`. The starter owns this file: it describes
 * every optional feature as data (files, packages, scripts, env keys, anchor
 * ids, overlays) so the CLI never carries its own list of starter paths.
 */

export type OptionValue = string | boolean | string[];
export type Answers = Record<string, OptionValue>;

export interface OptionSpec {
  type: 'choice' | 'boolean' | 'multi';
  label?: string;
  values?: string[];
  default: OptionValue;
  /** Option values (per option) that must hold for this option to be selectable. */
  requires?: Record<string, OptionValue[]>;
}

export interface UnwrapJsx {
  file: string;
  tag: string;
}

export interface UnwrapCall {
  file: string;
  name: string;
}

export interface Variant {
  remove?: string[];
  overlay?: string;
  anchors?: string[];
  unwrapJsx?: UnwrapJsx[];
  unwrapCall?: UnwrapCall[];
  packages?: string[];
  devPackages?: string[];
  scripts?: string[];
  env?: string[];
  packageJsonKeys?: string[];
}

export interface Feature {
  description?: string;
  when: Record<string, OptionValue[]>;
  on?: Variant;
  off?: Variant;
}

export interface PackageManagerSpec {
  packageManager?: string;
  lockfile: string;
  overlay?: string;
  remove?: string[];
  engines?: Record<string, string>;
}

export interface StarterManifest {
  manifestVersion: number;
  starter: { name: string; version: string; minCli?: string };
  options: Record<string, OptionSpec>;
  always: { remove: string[] };
  features: Record<string, Feature>;
  packageManagers: Record<string, PackageManagerSpec>;
  validateScript?: { name: string; steps: string[] };
}

export const MANIFEST_FILE = 'next-maker.json';
export const OVERLAYS_DIR = '.next-maker/overlays';
export const SUPPORTED_MANIFEST_VERSION = 1;

const fail = (message: string): never => {
  throw new Error(`Invalid ${MANIFEST_FILE}: ${message}`);
};

export const validateManifest = (raw: unknown): StarterManifest => {
  if (typeof raw !== 'object' || raw === null) fail('not an object');
  const m = raw as Partial<StarterManifest>;
  if (m.manifestVersion !== SUPPORTED_MANIFEST_VERSION) {
    fail(
      `manifestVersion ${String(m.manifestVersion)} is not supported by this CLI (expected ${SUPPORTED_MANIFEST_VERSION})`,
    );
  }
  if (!m.starter?.name || !m.starter.version) fail('starter.name and starter.version are required');
  if (!m.options || typeof m.options !== 'object') fail('options is required');
  if (!m.features || typeof m.features !== 'object') fail('features is required');
  if (!m.packageManagers || typeof m.packageManagers !== 'object') {
    fail('packageManagers is required');
  }
  const options = m.options as Record<string, OptionSpec>;
  const features = m.features as Record<string, Feature>;
  for (const [name, spec] of Object.entries(options)) {
    if (!['choice', 'boolean', 'multi'].includes(spec.type)) {
      fail(`option ${name} has unknown type ${String(spec.type)}`);
    }
    if (spec.type !== 'boolean' && !Array.isArray(spec.values)) {
      fail(`option ${name} needs a values array`);
    }
    if (spec.default === undefined) fail(`option ${name} needs a default`);
  }
  for (const [id, feature] of Object.entries(features)) {
    if (!feature.when || typeof feature.when !== 'object') fail(`feature ${id} needs a when`);
    for (const option of Object.keys(feature.when)) {
      if (!options[option]) fail(`feature ${id} refers to unknown option ${option}`);
    }
  }
  return {
    ...(m as StarterManifest),
    always: { remove: m.always?.remove ?? [] },
  };
};

export const loadStarterManifest = async (starterDir: string): Promise<StarterManifest> => {
  const file = path.join(starterDir, MANIFEST_FILE);
  let content: string;
  try {
    content = await readFile(file, 'utf-8');
  } catch {
    throw new Error(
      `The starter at ${starterDir} has no ${MANIFEST_FILE}. This CLI needs a starter that ships a composition manifest (nextjs-starter 2.x or later).`,
    );
  }
  return validateManifest(JSON.parse(content));
};

const includesValue = (haystack: OptionValue[], value: OptionValue): boolean =>
  haystack.some((candidate) => candidate === value);

/** Does the option's current value satisfy a `when` / `requires` clause? */
export const satisfies = (
  spec: OptionSpec | undefined,
  current: OptionValue | undefined,
  accepted: OptionValue[],
): boolean => {
  if (current === undefined) return false;
  if (spec?.type === 'multi' && Array.isArray(current)) {
    return current.some((v) => includesValue(accepted, v));
  }
  return includesValue(accepted, current);
};

export const isFeatureOn = (
  manifest: StarterManifest,
  feature: Feature,
  answers: Answers,
): boolean =>
  Object.entries(feature.when).every(([option, accepted]) =>
    satisfies(manifest.options[option], answers[option], accepted),
  );

/** The value an option takes when its requirements are not met. */
const offValue = (spec: OptionSpec): OptionValue => {
  if (spec.type === 'boolean') return false;
  if (spec.type === 'multi') return [];
  return spec.default;
};

export interface ResolvedAnswers {
  answers: Answers;
  /** Options the resolver changed because their requirements were not met. */
  forced: { option: string; value: OptionValue; reason: string }[];
  /** Unknown option names that were supplied and ignored. */
  unknown: string[];
}

const coerce = (spec: OptionSpec, name: string, value: unknown): OptionValue => {
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`Option ${name} expects true or false, got ${String(value)}`);
  }
  if (spec.type === 'multi') {
    const list = Array.isArray(value) ? value : String(value).split(',');
    const cleaned = list.map((v) => String(v).trim()).filter(Boolean);
    for (const v of cleaned) {
      if (!spec.values?.includes(v)) {
        throw new Error(`Option ${name} does not accept ${v}; valid: ${spec.values?.join(', ')}`);
      }
    }
    return cleaned;
  }
  const str = String(value);
  if (!spec.values?.includes(str)) {
    throw new Error(`Option ${name} does not accept ${str}; valid: ${spec.values?.join(', ')}`);
  }
  return str;
};

/**
 * Fill defaults, coerce string flags, and enforce `requires` constraints in
 * manifest order (a requirement always refers to an option declared earlier).
 */
export const resolveAnswers = (
  manifest: StarterManifest,
  supplied: Record<string, unknown> = {},
): ResolvedAnswers => {
  const answers: Answers = {};
  const forced: ResolvedAnswers['forced'] = [];
  const unknown = Object.keys(supplied).filter((k) => !manifest.options[k]);

  for (const [name, spec] of Object.entries(manifest.options)) {
    const raw = supplied[name];
    answers[name] = raw === undefined ? spec.default : coerce(spec, name, raw);
  }

  for (const [name, spec] of Object.entries(manifest.options)) {
    if (!spec.requires) continue;
    for (const [dep, accepted] of Object.entries(spec.requires)) {
      if (satisfies(manifest.options[dep], answers[dep], accepted)) continue;
      const off = offValue(spec);
      if (answers[name] !== off && JSON.stringify(answers[name]) !== JSON.stringify(off)) {
        forced.push({
          option: name,
          value: off,
          reason: `${name} requires ${dep} to be ${accepted.map(String).join(' or ')}`,
        });
        answers[name] = off;
      }
    }
  }

  return { answers, forced, unknown };
};
