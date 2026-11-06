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
// Estilo de página "jornal": gótica do cabeçalho, versaletes, itálico antigo e texto
import '@fontsource/unifrakturcook/700.css'
import '@fontsource/old-standard-tt/400.css'
import '@fontsource/old-standard-tt/700.css'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/im-fell-english/400-italic.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/playfair-display/900.css'
// Presets caderno de campo, dossiê, iluminura, cartaz e correio
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/600.css'
import '@fontsource/special-elite/400.css'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/alfa-slab-one/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/700.css'
import '@fontsource/abril-fatface/400.css'
import '@fontsource/homemade-apple/400.css'
import '@fontsource/libre-baskerville/400.css'
import '@fontsource/libre-baskerville/400-italic.css'
import '@fontsource/libre-baskerville/700.css'
import '@fontsource/im-fell-dw-pica/400.css'
import '@fontsource/im-fell-dw-pica/400-italic.css'
import '@fontsource/im-fell-dw-pica-sc/400.css'
import '@fontsource/cinzel/400.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/pinyon-script/400.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/lora/400.css'
import '@fontsource/lora/400-italic.css'
import '@fontsource/lora/700.css'
import '@fontsource/yellowtail/400.css'

import './index.css'
import '../../shared/journal.css'
import '../../shared/album.css'
import '../../shared/page.css'
import '../../shared/campo.css'
import '../../shared/dossie.css'
import '../../shared/iluminura.css'
import '../../shared/cartaz.css'
import '../../shared/correio.css'
import '../../shared/rosto.css'
import '../../shared/verbete.css'
import '../../shared/gazeta.css'
import '../../shared/diario.css'
import '../../shared/decreto.css'
import '../../shared/revista.css'

// Plataforma no <html> para estilos específicos (ex: semáforos do macOS sobre o app)
if (window.electronAPI?.platform) document.documentElement.dataset.platform = window.electronAPI.platform

// ── Strict Mode ───────────────────────────────────────────────────────────────
// React.StrictMode intentionally double-invokes certain lifecycle methods in
// development to help detect side effects. Remove for production performance
// profiling if needed, but keep it during development.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
