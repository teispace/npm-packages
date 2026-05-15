/**
 * Central registry of feature manifests. `doctor` and `remove` walk this
 * registry; `setup` imports individual manifests when it needs `apply`.
 */

import { bundleAnalyzerManifest } from './bundle-analyzer.manifest';
import { commitizenManifest } from './commitizen.manifest';
import { darkThemeManifest } from './dark-theme.manifest';
import { httpClientManifest } from './http-client.manifest';
import { i18nManifest } from './i18n.manifest';
import { reactCompilerManifest } from './react-compiler.manifest';
import { reduxManifest } from './redux.manifest';
import { securityHeadersManifest } from './security-headers.manifest';
import { testsManifest } from './tests.manifest';
import type { FeatureManifest } from './types';
import { validateScriptsManifest } from './validate-scripts.manifest';
import { wsManifest } from './ws.manifest';

export type { RemoveSummary } from './runner';
export { checkManifest, reverseManifest } from './runner';
export type {
  CodeBlockRequirement,
  DepKind,
  FeatureCheckResult,
  FeatureFinding,
  FeatureManifest,
  FileRequirement,
  PackageRequirement,
  ScriptRequirement,
} from './types';

/** Ordered for sensible doctor output: simple/visible features first. */
export const MANIFESTS: ReadonlyArray<FeatureManifest> = [
  securityHeadersManifest,
  validateScriptsManifest,
  commitizenManifest,
  reactCompilerManifest,
  bundleAnalyzerManifest,
  testsManifest,
  darkThemeManifest,
  httpClientManifest,
  reduxManifest,
  // WS sits below Redux because it depends on it (bridge dispatches into
  // wsReducer). Doctor renders manifests in this order; surfacing Redux
  // first makes drift causes obvious when both are missing.
  wsManifest,
  i18nManifest,
];

export const getManifest = (id: string): FeatureManifest | undefined =>
  MANIFESTS.find((m) => m.id === id);

export {
  bundleAnalyzerManifest,
  commitizenManifest,
  darkThemeManifest,
  httpClientManifest,
  i18nManifest,
  reactCompilerManifest,
  reduxManifest,
  securityHeadersManifest,
  testsManifest,
  validateScriptsManifest,
  wsManifest,
};
