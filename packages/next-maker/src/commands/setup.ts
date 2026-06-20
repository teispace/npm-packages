import type { Command } from 'commander';
import Enquirer from 'enquirer';
import pc from 'picocolors';
import { log, logError, spinner } from '../config';
import { setupBundleAnalyzer } from '../services/setup/bundle-analyzer';
import { setupCommitizen } from '../services/setup/commitizen';
import { setupDarkTheme } from '../services/setup/dark-theme';
import { setupHttpClient } from '../services/setup/http-client';
import { setupI18n } from '../services/setup/i18n';
import { setupReactCompiler } from '../services/setup/react-compiler';
import { setupRedux } from '../services/setup/redux';
import { setupSecurityHeaders } from '../services/setup/security-headers';
import { setupTests } from '../services/setup/tests';
import { setupValidationScripts } from '../services/setup/validate-scripts';
import { setupWs } from '../services/setup/ws';

const { prompt } = Enquirer;

export interface SetupOptions {
  httpClient?: string;
  darkTheme?: boolean;
  redux?: boolean;
  ws?: boolean;
  i18n?: boolean;
  tests?: boolean;
  reactCompiler?: boolean;
  bundleAnalyzer?: boolean;
  securityHeaders?: boolean;
  validateScripts?: boolean;
  commitizen?: boolean;
}

type SetupHandler = (cwd: string) => Promise<void>;

interface FeatureSpec {
  /** Machine value: the enquirer choice `name`, handler-map key, and CLI label. */
  key: string;
  /** Human-readable label shown in the interactive picker. */
  label: string;
  /** Which `SetupOptions` flag enables this feature non-interactively. */
  flag: keyof SetupOptions;
  handler: SetupHandler;
}

/**
 * Single source of truth for every setup feature. The interactive choices, the
 * flag-based dispatch, and the handler lookup are all derived from this list so
 * they can never drift out of sync again (the original bug was three parallel
 * lists where the choices returned labels but the handler map was keyed by
 * machine values, so every interactive selection fell through to "not
 * implemented yet").
 *
 * Order matters: redux must run before ws (the ws bridge dispatches into a
 * Redux slice, so the store must exist first).
 */
export const SETUP_FEATURES: readonly FeatureSpec[] = [
  {
    key: 'http-client',
    label: 'HTTP Client (Axios/Fetch)',
    flag: 'httpClient',
    handler: setupHttpClient,
  },
  { key: 'dark-theme', label: 'Dark Theme', flag: 'darkTheme', handler: setupDarkTheme },
  { key: 'redux', label: 'Redux Toolkit', flag: 'redux', handler: setupRedux },
  { key: 'ws', label: 'WebSocket Client (requires Redux)', flag: 'ws', handler: setupWs },
  { key: 'i18n', label: 'Internationalization (next-intl)', flag: 'i18n', handler: setupI18n },
  { key: 'tests', label: 'Testing (Vitest + RTL)', flag: 'tests', handler: setupTests },
  {
    key: 'react-compiler',
    label: 'React Compiler',
    flag: 'reactCompiler',
    handler: setupReactCompiler,
  },
  {
    key: 'bundle-analyzer',
    label: 'Bundle Analyzer',
    flag: 'bundleAnalyzer',
    handler: setupBundleAnalyzer,
  },
  {
    key: 'security-headers',
    label: 'Security Headers',
    flag: 'securityHeaders',
    handler: setupSecurityHeaders,
  },
  {
    key: 'validate-scripts',
    label: 'Validation Scripts',
    flag: 'validateScripts',
    handler: setupValidationScripts,
  },
  { key: 'commitizen', label: 'Commitizen', flag: 'commitizen', handler: setupCommitizen },
] as const;

/** Optional seam so tests can inject a fake prompt and assert dispatch. */
export interface RunSetupDeps {
  promptFn?: typeof prompt;
  cwd?: () => string;
}

/**
 * Core setup logic, extracted from the commander action so it can be unit
 * tested with an injected prompt. Returns the key of the feature that was run
 * (or `null` when nothing ran), which makes dispatch directly assertable.
 */
export const runSetup = async (
  options: SetupOptions,
  deps: RunSetupDeps = {},
): Promise<string | null> => {
  const promptFn = deps.promptFn ?? prompt;
  const getCwd = deps.cwd ?? (() => process.cwd());

  log(pc.cyan('\n🔧 Setup Wizard\n'));

  // Non-interactive path: run every feature whose flag was passed, in the
  // canonical SETUP_FEATURES order (so redux precedes ws).
  const flagged = SETUP_FEATURES.filter((f) => Boolean(options[f.flag]));
  if (flagged.length > 0) {
    for (const feature of flagged) {
      await feature.handler(getCwd());
    }
    return flagged.length === 1 ? flagged[0].key : 'multiple';
  }

  // Interactive path. Enquirer's `select` returns the chosen choice's `name`,
  // so `name` holds the machine key and `message` the human label.
  const setupChoice = await promptFn<{ feature: string }>([
    {
      type: 'select',
      name: 'feature',
      message: 'What would you like to setup?',
      choices: [
        ...SETUP_FEATURES.map((f) => ({ name: f.key, message: f.label })),
        { name: 'cancel', message: 'Cancel' },
      ],
    },
  ]);
  const feature = setupChoice.feature;

  if (feature === 'cancel') {
    log(pc.yellow('Setup cancelled.'));
    return null;
  }

  const spec = SETUP_FEATURES.find((f) => f.key === feature);
  if (spec) {
    await spec.handler(getCwd());
    return spec.key;
  }

  log(pc.yellow(`\n⚠️  ${feature} setup is not implemented yet.`));
  return null;
};

export const registerSetupCommand = (program: Command) => {
  program
    .command('setup')
    .description('Setup features in an existing Next.js project')
    .option('--http-client', 'Setup HTTP client (axios|fetch)')
    .option('--dark-theme', 'Setup Dark Theme (Tailwind + @teispace/next-themes)')
    .option('--redux', 'Setup Redux Toolkit')
    .option('--ws', 'Setup WebSocket client (socket.io-client + Redux bridge; requires --redux)')
    .option('--i18n', 'Setup next-intl for internationalization')
    .option('--tests', 'Setup testing (Vitest + React Testing Library)')
    .option('--react-compiler', 'Enable the React Compiler')
    .option('--bundle-analyzer', 'Add @next/bundle-analyzer')
    .option('--security-headers', 'Add hardened HTTP headers to next.config.ts')
    .option(
      '--validate-scripts',
      'Add scripts/sync-env.ts, scripts/check-deprecated.ts, and the validate chain',
    )
    .option('--commitizen', 'Add Commitizen with the conventional-changelog adapter')
    .action(async (options: SetupOptions) => {
      try {
        await runSetup(options);
      } catch (error) {
        spinner.fail('Setup failed');
        logError(`${error}`);
        process.exit(1);
      }
    });
};
