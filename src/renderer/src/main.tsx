/**
 * Renderer Entry Point
 *
 * Bootstraps React and mounts the application into the DOM.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// ── Fontes auto-hospedadas (@fontsource) ──────────────────────────────────────
// Bundled diretamente no app — sem CDN, sem CSP, sem dependência de internet.
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/400-italic.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'

import './index.css'

// ── Strict Mode ───────────────────────────────────────────────────────────────
// React.StrictMode intentionally double-invokes certain lifecycle methods in
// development to help detect side effects. Remove for production performance
// profiling if needed, but keep it during development.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
