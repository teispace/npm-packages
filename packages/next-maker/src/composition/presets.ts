import type { Answers } from './manifest';

/**
 * Named answer sets for `init --preset`. Only options that differ from the
 * manifest defaults are listed; everything else resolves to its default.
 */
export const PRESETS: Record<string, { description: string; answers: Answers }> = {
  default: {
    description: 'Manifest defaults: Redux, fetch, i18n, dark mode, unit + e2e tests, hooks',
    answers: {},
  },
  minimal: {
    description: 'No state store, no i18n, no dark mode, no tests, no hooks',
    answers: {
      state: 'none',
      i18n: false,
      darkMode: false,
      tests: false,
      e2e: false,
      hooks: false,
      commitizen: false,
    },
  },
  full: {
    description:
      'Everything on: WebSocket, both HTTP adapters, Docker, CI, analyzer, OpenAPI, templates',
    answers: {
      ws: true,
      http: 'both',
      docker: true,
      ci: true,
      analyzer: true,
      openapi: true,
      githubTemplates: true,
      communityFiles: ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md'],
    },
  },
  zustand: {
    description: 'Defaults with Zustand instead of Redux',
    answers: { state: 'zustand' },
  },
  spa: {
    description: 'Client-heavy app: Zustand, Axios, no i18n, Docker and CI on',
    answers: { state: 'zustand', http: 'axios', i18n: false, docker: true, ci: true },
  },
};

export const presetNames = (): string[] => Object.keys(PRESETS);

export const getPreset = (name: string): Answers => {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unknown preset "${name}". Valid: ${presetNames().join(', ')}.`);
  return { ...preset.answers };
};
