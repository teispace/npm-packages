import { setupRedux } from '../services/setup/redux';
import { unwrapJsxChain } from './transforms/unwrap-jsx';
import type { FeatureManifest } from './types';

/**
 * Slim manifest for Redux. Detection covers the typical footprint, but the
 * code injections (root reducer, providers chain, page wiring) aren't
 * encoded as `removePattern`s — `remove` reports them as manual cleanup so
 * the user can confirm before stripping.
 */
export const reduxManifest: FeatureManifest = {
  id: 'redux',
  name: 'Redux Toolkit',
  description: 'Redux Toolkit + react-redux + redux-persist + StoreProvider',
  detect: async (projectPath) => {
    const { detectProjectSetup } = await import('../detection');
    return (await detectProjectSetup(projectPath)).hasRedux;
  },
  files: [
    {
      path: 'src/store',
      generated: true,
      isDir: true,
      containsUserContent: true,
      removeHint: 'holds the rootReducer and any slices you registered — review before deleting',
    },
    { path: 'src/providers/StoreProvider.tsx', generated: true },
  ],
  packages: [
    { name: '@reduxjs/toolkit', kind: 'dependency' },
    { name: 'react-redux', kind: 'dependency' },
    { name: 'redux-persist', kind: 'dependency' },
  ],
  scripts: [],
  injections: [
    {
      file: 'src/providers/RootProvider.tsx',
      description: '<StoreProvider> wrap in RootProvider',
      presence: /<StoreProvider/,
      removePattern: unwrapJsxChain('StoreProvider'),
    },
  ],
  apply: setupRedux,
};
