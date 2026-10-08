// O pacote é CommonJS: o Node não expõe `configs` como export nomeado em ESM
import tsPkg from '@electron-toolkit/eslint-config-ts'
import prettierConfig from '@electron-toolkit/eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'

const { configs: tsConfigs } = tsPkg

export default [
  { ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/.vite/**'] },
  ...tsConfigs.recommended,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    rules: {
      // Allow unused vars prefixed with underscore (common pattern for intentionally unused params)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Warn on explicit any
      '@typescript-eslint/no-explicit-any': 'warn',
      // O código não segue o Prettier (aspas simples, sem ponto e vírgula, linhas longas):
      // formatação não é verificada pelo lint
      'prettier/prettier': 'off',
      // Componentes e hooks não anotam o tipo de retorno (a inferência basta)
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    // Interface e preload passam pelo javascript-obfuscator no build protegido
    // (scripts/protect.js), que às vezes perde argumentos espalhados numa chamada
    // de função pelo nome — `f(...lista)` vira `f(lista[0])`. Já aconteceu com as
    // preferências salvas. Chamadas de método (obj.f(...x)) não são afetadas.
    files: ['src/renderer/**/*.{ts,tsx}', 'src/preload/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      // f.apply(null, lista) é a alternativa segura ao spread aqui
      'prefer-spread': 'off',
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.type="Identifier"] > SpreadElement',
        message: 'O ofuscador do build protegido perde argumentos em f(...lista): passe a lista ou use f.apply(null, lista).'
      }]
    }
  },
  {
    // Scripts de build e configs em CommonJS
    files: ['**/*.js', '**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
]
