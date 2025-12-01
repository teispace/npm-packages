export const PACKAGES = {
  // Dependencies
  REDUX_TOOLKIT: '@reduxjs/toolkit',
  REACT_REDUX: 'react-redux',
  REDUX_PERSIST: 'redux-persist',
  REACT_SECURE_STORAGE: 'react-secure-storage',
  NEXT_INTL: 'next-intl',
  NEXT_THEMES: 'next-themes',
  AXIOS: 'axios',

  // Dev Dependencies
  HUSKY: 'husky',
  COMMITLINT_CLI: '@commitlint/cli',
  COMMITLINT_CONFIG: '@commitlint/config-conventional',
  LINT_STAGED: 'lint-staged',
  COMMITIZEN: 'commitizen',
  CZ_CONVENTIONAL_CHANGELOG: 'cz-conventional-changelog',
} as const;
