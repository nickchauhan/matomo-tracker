import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: [
      '**/es/',
      '**/lib/',
      '**/*.d.ts',
      '**/node_modules/',
      'eslintrc.config.mjs',
      'packages/*/eslintrc.config.mjs',
    ],
  },
  ...compat.extends(
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
    'plugin:jest/recommended',
  ),
  {
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',

      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },

    rules: {
      'import/no-extraneous-dependencies': 'off',
      'react/require-default-props': 'off',
    },
  },
]
