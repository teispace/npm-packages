export const PACKAGES = {
  // Dependencies
  REDUX_TOOLKIT: '@reduxjs/toolkit',
  REACT_REDUX: 'react-redux',
  REDUX: 'redux',
  REDUX_PERSIST: 'redux-persist',
  REACT_SECURE_STORAGE: 'react-secure-storage',
  NEXT_INTL: 'next-intl',
  NEXT_THEMES: '@teispace/next-themes',
  AXIOS: 'axios',

  // Dev Dependencies
  HUSKY: 'husky',
  COMMITLINT_CLI: '@commitlint/cli',
  COMMITLINT_CONFIG: '@commitlint/config-conventional',
  LINT_STAGED: 'lint-staged',
  COMMITIZEN: 'commitizen',
  CZ_CONVENTIONAL_CHANGELOG: 'cz-conventional-changelog',

  // Testing
  VITEST: 'vitest',
  JSDOM: 'jsdom',
  VITE_PLUGIN_REACT: '@vitejs/plugin-react',
  TESTING_LIBRARY_DOM: '@testing-library/dom',
  TESTING_LIBRARY_JEST_DOM: '@testing-library/jest-dom',
  TESTING_LIBRARY_REACT: '@testing-library/react',
  TESTING_LIBRARY_USER_EVENT: '@testing-library/user-event',

  // Optional tooling
  REACT_COMPILER_BABEL: 'babel-plugin-react-compiler',
  NEXT_BUNDLE_ANALYZER: '@next/bundle-analyzer',
} as const;
