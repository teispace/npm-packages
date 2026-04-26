/**
 * Declarative description of a "feature" the CLI can install/detect/remove.
 *
 * The same manifest powers three commands: `setup` (install), `doctor`
 * (detect drift), and `remove` (undo). Encoding the feature's footprint as
 * data — files, deps, scripts, code blocks — lets each command operate
 * generically without growing per-feature special cases.
 *
 * Manifests are intentionally additive: the simple features list every part
 * of their footprint, while heavy features (redux, i18n, etc.) start with a
 * lighter manifest that doctor/remove can extend over time.
 */

export type DepKind = 'dependency' | 'devDependency';

export interface PackageRequirement {
  name: string;
  kind: DepKind;
}

export interface FileRequirement {
  /** Path relative to the project root. */
  path: string;
  /**
   * If true (default), missing the file counts as drift when the feature is
   * installed. Optional files (e.g. `.env`) record presence without flagging.
   */
  required?: boolean;
  /** Whether the path points to a directory. */
  isDir?: boolean;
  /** Used by `remove` to decide whether deletion is safe. */
  generated: boolean;
}

export interface ScriptRequirement {
  /** package.json scripts.<name> */
  name: string;
  /** Optional exact-value check. When omitted, only the key's presence is checked. */
  expectedValue?: string;
}

export interface CodeBlockRequirement {
  /** File the block lives in, relative to the project root. */
  file: string;
  /** Human-readable label used in doctor output. */
  description: string;
  /** RegExp that matches when the block is present (for both detection and drift). */
  presence: RegExp;
  /**
   * RegExp matching the full block when removing. If omitted, `remove` will
   * report "manual removal needed" rather than guessing.
   */
  removePattern?: RegExp;
}

export interface FeatureFootprint {
  files: FileRequirement[];
  packages: PackageRequirement[];
  scripts: ScriptRequirement[];
  injections: CodeBlockRequirement[];
}

export interface FeatureManifest extends FeatureFootprint {
  id: string;
  name: string;
  description: string;
  /**
   * High-level "is this feature installed?" check. May be cheaper than
   * walking every file/package/injection in `footprint`.
   */
  detect: (projectPath: string) => Promise<boolean>;
  /**
   * Idempotent installer. Doctor's `--fix` flag and the manifest-based
   * `setup` path both call this. Optional because some manifests are
   * detection-only (e.g. core artifacts that should never be re-applied).
   */
  apply?: (projectPath: string) => Promise<void>;
  /**
   * Custom remover. When omitted, the generic reverser walks the footprint
   * and only removes pieces it is confident about (files marked `generated`,
   * scripts, packages, code blocks with a `removePattern`).
   */
  remove?: (projectPath: string) => Promise<void>;
}

export type FeatureFinding =
  | { kind: 'missingFile'; file: string; description?: string }
  | { kind: 'missingPackage'; name: string; depKind: DepKind }
  | { kind: 'missingScript'; name: string }
  | { kind: 'mismatchedScript'; name: string; expected: string; actual: string }
  | { kind: 'missingInjection'; file: string; description: string };

export interface FeatureCheckResult {
  manifest: FeatureManifest;
  installed: boolean;
  /** Empty when installed and complete; populated when there is drift. */
  drift: FeatureFinding[];
}
