import { configs as tsConfigs } from '@electron-toolkit/eslint-config-ts'
import prettierConfig from '@electron-toolkit/eslint-config-prettier'

export default [
  { ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/.vite/**'] },
  ...tsConfigs.recommended,
  prettierConfig,
  {
    rules: {
      // Allow unused vars prefixed with underscore (common pattern for intentionally unused params)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Warn on explicit any
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
]
