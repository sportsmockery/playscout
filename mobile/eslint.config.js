// Flat config consumed by `eslint .`
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // scripts/* are Node build tools (not RN) with their own globals.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'assets/*', 'scripts/*'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
