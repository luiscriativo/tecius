import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // ─── Main Process ────────────────────────────────────────────────────────────
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },

  // ─── Preload Script ──────────────────────────────────────────────────────────
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },

  // ─── Renderer (React) ────────────────────────────────────────────────────────
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        // Path alias: use @/ to reference src/renderer/src/
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          // Dados (JSON importado sob demanda: mapas, gazetteer, fronteiras) ficam em
          // assets/data/ — o scripts/protect.js não ofusca essa pasta (não é código)
          chunkFileNames: (chunk) =>
            chunk.facadeModuleId?.endsWith('.json') ? 'assets/data/[name]-[hash].js' : 'assets/[name]-[hash].js'
        }
      }
    }
  }
})
