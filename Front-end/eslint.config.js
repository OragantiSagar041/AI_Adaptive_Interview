import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public/models/**', 'rewrite.cjs', 'scratch.js', 'test_error.cjs']),
  {
    // Single config object: plugins declared here, so all rules below can resolve them.
    // Previously the rules were in a SEPARATE config object without plugin access,
    // causing react-hooks/exhaustive-deps (and others) to fail silently.
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'react-refresh/only-export-components': 'off',
    }
  }
])
