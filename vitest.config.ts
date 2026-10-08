import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Testes de unidade da lógica pura do renderer (sem DOM nem Electron)
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src/renderer/src') }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
