/**
 * Foto colada do estilo "álbum": cantoneiras, fita no topo e legenda manuscrita.
 * `AlbumPhoto` para a página; `albumPhotoHtml` para a exportação (HTML estático).
 */

import type React from 'react'

export function AlbumPhoto({ src, caption, wide, right, children }: { src?: string; caption?: string; wide?: boolean; right?: boolean; children?: React.ReactNode }) {
  return (
    <span className={`pa-photo${wide ? ' pa-photo-wide' : ''}${right ? ' pa-photo-right' : ''}`} data-testid="album-photo">
      <span className="pa-tape" />
      <span className="pa-corner pa-corner-1" /><span className="pa-corner pa-corner-2" />
      <span className="pa-corner pa-corner-3" /><span className="pa-corner pa-corner-4" />
      {children ?? <img src={src} alt={caption ?? ''} />}
      {caption && <span className="pa-caption">{caption}</span>}
    </span>
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function albumPhotoHtml(src: string, caption: string, wide = false): string {
  return `<span class="pa-photo${wide ? ' pa-photo-wide' : ''}"><span class="pa-tape"></span><span class="pa-corner pa-corner-1"></span><span class="pa-corner pa-corner-2"></span><span class="pa-corner pa-corner-3"></span><span class="pa-corner pa-corner-4"></span><img src="${esc(src)}" alt="${esc(caption)}">${caption ? `<span class="pa-caption">${esc(caption)}</span>` : ''}</span>`
}
