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
  /**
   * Set on directories that may legitimately contain user-authored files
   * after the feature ships (e.g. `src/app/[locale]` accumulates pages,
   * `src/store` accumulates slices). `remove` will NEVER recursively delete
   * such paths — it surfaces them as manual cleanup with a guidance message
   * so the user can migrate their content first.
   */
  containsUserContent?: boolean;
  /**
   * Optional guidance shown when a `containsUserContent` directory is left
   * behind during `remove`. e.g. "Move pages out of src/app/[locale]/ before
   * deleting".
   */
  removeHint?: string;
}

export interface ScriptRequirement {
  /** package.json scripts.<name> */
  name: string;
  /** Optional exact-value check. When omitted, only the key's presence is checked. */
  expectedValue?: string;
}

/**
 * Custom remove transform.
 *
 * Receives the file's full content; returns either the transformed content
 * (auto-removal succeeded) or `null` to fall back to manual cleanup
 * (the file shape has drifted from what we expected and we'd rather
 * surface it for human review than guess).
 */
export type RemoveTransform = (content: string) => string | null;

export interface CodeBlockRequirement {
  /** File the block lives in, relative to the project root. */
  file: string;
  /**
   * Alternative homes for the *same* block, checked after `file`.
   *
   * Models "exactly one of these paths exists in a healthy project" — e.g.
   * the HTTP bundle sentinel mounts in `src/app/[locale]/layout.tsx` when
   * i18n is installed and in `src/app/layout.tsx` otherwise, never both.
   *
   * This is deliberately preferred over an `optional: true` marker on two
   * separate requirements. `optional` would say "it's fine if this block is
   * missing", which is a lie: the block IS required, we just don't know up
   * front which file hosts it. With `anyOf` semantics the checker can still
   * flag the honest failure modes — the block missing from every candidate
   * that exists, or no candidate existing at all.
   */
  alternativeFiles?: string[];
  /** Human-readable label used in doctor output. */
  description: string;
  /** RegExp that matches when the block is present (for both detection and drift). */
  presence: RegExp;
  /**
   * Strategy for removal. Either:
   * - `RegExp`: matched content is replaced with empty string.
   * - `RemoveTransform` function: returns the transformed file content, or
   *   `null` to surface as manual cleanup.
   *
   * If omitted entirely, `remove` reports the block as manual cleanup.
   */
  removePattern?: RegExp | RemoveTransform;
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
   * Installer / repairer.
   *
   * Called with no `drift` it behaves as a first-run installer (the
   * manifest-based `setup` path). Called WITH a non-empty `drift` array it
   * must take the repair path: fix exactly the reported findings on an
   * already-installed feature, without consulting its own "is this already
   * set up?" first-run guard — that guard tests the same signals as
   * `detect()`, so honouring it during a repair would make `doctor --fix` a
   * guaranteed no-op.
   *
   * Optional because some manifests are detection-only; doctor reports
   * those as "no automatic fix available" instead of pretending.
   */
  apply?: (projectPath: string, drift?: FeatureFinding[]) => Promise<void>;
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
  // `expected` is carried through from the manifest's `expectedValue` so a
  // repair can restore the script without importing the manifest back
  // (services must not depend on manifests — that direction is circular).
  | { kind: 'missingScript'; name: string; expected?: string }
  | { kind: 'mismatchedScript'; name: string; expected: string; actual: string }
  | { kind: 'missingInjection'; file: string; description: string };

export interface FeatureCheckResult {
  manifest: FeatureManifest;
  installed: boolean;
  /** Empty when installed and complete; populated when there is drift. */
  drift: FeatureFinding[];
}
