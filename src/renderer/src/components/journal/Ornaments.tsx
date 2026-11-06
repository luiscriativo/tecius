/**
 * Ornamentos do estilo "jornal": arabescos dos cantos e a vinheta (fleuron).
 * SVG em currentColor: trocam de cor com a paleta (claro/escuro).
 */

const CORNER = (
  <svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <path d="M1 33V1h32" />
    <path d="M5 29V5h24" />
    <path d="M5 5c6 0 9 3 9 9M5 5c0 6 3 9 9 9" />
    <circle cx="14" cy="14" r="1.6" fill="currentColor" />
  </svg>
)

/** Os quatro cantos da página */
export function JournalCorners() {
  return (
    <>
      <div className="pj-corner pj-corner-tl">{CORNER}</div>
      <div className="pj-corner pj-corner-tr">{CORNER}</div>
      <div className="pj-corner pj-corner-bl">{CORNER}</div>
      <div className="pj-corner pj-corner-br">{CORNER}</div>
    </>
  )
}

/** Vinheta centrada entre blocos */
export function Fleuron() {
  return (
    <div className="pj-fleuron" aria-hidden="true">
      <svg viewBox="0 0 160 16" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M0 8h60M100 8h60" />
        <path d="M68 8c4-6 8-6 12 0s8 6 12 0" />
        <path d="M64 8l4-4M64 8l4 4M96 8l-4-4M96 8l-4 4" />
        <circle cx="80" cy="8" r="1.5" fill="currentColor" />
      </svg>
    </div>
  )
}

/** Versões em texto (para a exportação, que é HTML estático) */
export const CORNER_SVG = '<svg viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M1 33V1h32"/><path d="M5 29V5h24"/><path d="M5 5c6 0 9 3 9 9M5 5c0 6 3 9 9 9"/><circle cx="14" cy="14" r="1.6" fill="currentColor"/></svg>'
export const FLEURON_SVG = '<svg viewBox="0 0 160 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M0 8h60M100 8h60"/><path d="M68 8c4-6 8-6 12 0s8 6 12 0"/><path d="M64 8l4-4M64 8l4 4M96 8l-4-4M96 8l-4 4"/><circle cx="80" cy="8" r="1.5" fill="currentColor"/></svg>'
export const CORNERS_HTML = ['tl', 'tr', 'bl', 'br'].map((k) => `<div class="pj-corner pj-corner-${k}">${CORNER_SVG}</div>`).join('')
export const FLEURON_HTML = `<div class="pj-fleuron" aria-hidden="true">${FLEURON_SVG}</div>`
