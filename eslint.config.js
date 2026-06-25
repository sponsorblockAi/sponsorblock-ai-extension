import tsEslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tsEslint.config(
  {
    ignores: ['dist/', 'node_modules/', '*.config.*'],
  },
  ...tsEslint.configs.recommended,
  prettierConfig,
  // Global rules (apply to all files)
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Type-aware rules for source code only
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prevent unhandled promise rejections slipping through
      '@typescript-eslint/no-floating-promises': 'error',
      // Discourage direct console usage — use logger.ts helpers instead
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Relaxed rules for test files
  {
    files: ['tests/**/*.{js,ts}'],
    rules: {
      'no-console': 'off',
    },
  },
);
