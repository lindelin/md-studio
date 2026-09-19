module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/ban-types": "off",
    "no-async-promise-executor": "off",
    "no-empty": "off",
  },
  overrides: [
    {
      files: ['src/application/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/redux/**/*.{ts,tsx}'],
      excludedFiles: ['src/application/runtime.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/services/registry'],
                message: 'Use ApplicationClient, Command Bus, Workspace Store, or an injected browser adapter.',
              },
            ],
          },
        ],
      },
    },
  ],
}
