/**
 * Utilidades de edição num <textarea> do editor de eventos.
 */

import { diffRange, type TextEdit } from './markdownEdit'

/**
 * Aplica a edição como se fosse digitada (só o trecho que mudou, via insertText):
 * assim ela entra no histórico do Ctrl/Cmd+Z. Se o navegador recusar, cai no
 * `fallback`, que troca o texto inteiro (sem desfazer).
 */
export function applyTextEdit(ta: HTMLTextAreaElement, r: TextEdit, fallback: (v: string) => void) {
  const d = diffRange(ta.value, r.value)
  if (d.start !== d.endA || d.insert) {
    ta.focus()
    ta.setSelectionRange(d.start, d.endA)
    const ok = d.insert ? document.execCommand('insertText', false, d.insert) : document.execCommand('delete')
    if (!ok || ta.value !== r.value) fallback(r.value)
  }
  ta.setSelectionRange(r.selStart, r.selEnd)
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(r.selStart, r.selEnd) })
}

const MIRRORED = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight',
  'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
  'letterSpacing', 'wordSpacing', 'tabSize',
] as const

/**
 * Posição na tela (viewport) do caractere `pos` de um textarea: mede numa cópia
 * invisível com o mesmo estilo e quebra de linha.
 */
export function caretRect(ta: HTMLTextAreaElement, pos: number): { left: number; top: number; height: number } {
  const cs = getComputedStyle(ta)
  const div = document.createElement('div')
  for (const p of MIRRORED) div.style[p] = cs[p]
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', height: 'auto' })
  div.textContent = ta.value.slice(0, pos)
  const mark = document.createElement('span')
  mark.textContent = ta.value.slice(pos, pos + 1) || '.'
  div.appendChild(mark)
  document.body.appendChild(div)
  const r = ta.getBoundingClientRect()
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
  const out = { left: r.left + mark.offsetLeft - ta.scrollLeft, top: r.top + mark.offsetTop - ta.scrollTop, height: lh }
  div.remove()
  return out
}
