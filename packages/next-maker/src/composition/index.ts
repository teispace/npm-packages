export { hasAnchors, removeImportedSymbol, stripAnchors, unwrapCall, unwrapJsx } from './anchors';
export {
  applyComposition,
  type CompositionPlan,
  type CompositionReport,
  planComposition,
  pruneEmptyDirs,
} from './compose';
export { type InitConfigFile, loadInitConfig, parseSetFlags } from './config-file';
export { listFiles, matchFiles, patternToRegExp } from './glob';
export {
  type Answers,
  type Feature,
  isFeatureOn,
  loadStarterManifest,
  MANIFEST_FILE,
  type OptionSpec,
  type OptionValue,
  OVERLAYS_DIR,
  type PackageManagerSpec,
  type ResolvedAnswers,
  resolveAnswers,
  type StarterManifest,
  type Variant,
  validateManifest,
} from './manifest';
export { isCommandCarrier, rewritePackageManagerCommands, runCommand } from './package-manager';
export { getPreset, PRESETS, presetNames } from './presets';
