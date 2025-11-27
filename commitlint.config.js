const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 150],
  },
  prompt: {
    settings: {
      enableMultipleScopes: true,
    },
  },
};

export default config;
