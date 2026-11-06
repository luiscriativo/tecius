/**
 * Cabeçalho e rodapé comuns dos estilos de página "pg" (caderno de campo,
 * dossiê, iluminura, cartaz, correio, folha de rosto, verbete, gazeta, diário,
 * decreto, revista). O DOM é sempre o mesmo; cada preset
 * decide em CSS o que mostra, onde e como (ver src/shared/page.css e
 * src/shared/<preset>.css). Serve à tela e à exportação (renderToStaticMarkup).
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { importanceStars } from '@/utils/pageStyle'

export interface StyledHeadProps {
  title: string
  /** Linha de abertura: `kicker`, ou o chronicle, ou a timeline */
  kicker?: string
  edition?: string
  deck?: string
  date: string
  place?: string
  coords?: string
  category?: string
  importance?: number
  coverSrc?: string
  coverCaption?: string
  /** Brasão ou marca (`emblem:`): imagem do vault, posta onde cada preset quiser */
  emblemSrc?: string
  /** h1 na página do evento, h2 nos capítulos da timeline exportada */
  as?: 'h1' | 'h2'
  /** Rótulos (data-label) que alguns presets escrevem antes do valor */
  labels: { period: string; place: string; category: string; importance: string }
}

export function StyledHead({ title, kicker, edition, deck, date, place, coords, category, importance, coverSrc, coverCaption, emblemSrc, as = 'h1', labels }: StyledHeadProps) {
  const Title = as
  return (
    <header className="pg-head">
      <span className="pg-ornament" aria-hidden="true" />
      {emblemSrc && <img className="pg-emblem" src={emblemSrc} alt="" />}
      {kicker && <p className="pg-kicker">{kicker}</p>}
      {edition && <p className="pg-edition">{edition}</p>}
      <Title className="pg-title">{title}</Title>
      {deck && <p className="pg-deck">{deck}</p>}
      <div className="pg-meta">
        <span className="pg-date" data-label={labels.period}>{date}</span>
        {place && <span className="pg-place" data-label={labels.place}>{place}</span>}
        {coords && <span className="pg-coords">{coords}</span>}
        {category && <span className="pg-category" data-label={labels.category}>{category}</span>}
        <span className="pg-importance" data-label={labels.importance}><span className="pg-stars">{importanceStars(importance)}</span></span>
      </div>
      {coverSrc && (
        <span className="pg-cover">
          <img src={coverSrc} alt={coverCaption ?? ''} />
          {coverCaption && <span className="pg-caption">{coverCaption}</span>}
        </span>
      )}
    </header>
  )
}

export interface StyledFootProps {
  importance?: number
  category?: string
  tags: string[]
  importanceLabel: string
  /** Na tela as tags e a categoria são clicáveis */
  onTag?: (tag: string) => void
  onCategory?: (category: string) => void
}

export function StyledFoot({ importance, category, tags, importanceLabel, onTag, onCategory }: StyledFootProps) {
  if (!importance && !category && tags.length === 0) return null
  return (
    <footer className="pg-foot" data-testid="styled-foot">
      <span className="pg-foot-left">
        <span className="pg-foot-label">{importanceLabel}</span> <span className="pg-stars">{importanceStars(importance)}</span>
        {category && <> · {onCategory
          ? <button type="button" className="pg-category" onClick={() => onCategory(category)}>{category}</button>
          : <span className="pg-category">{category}</span>}</>}
      </span>
      <span className="pg-tags">
        {tags.map((tag) => onTag
          ? <button key={tag} type="button" className="pg-tag" onClick={() => onTag(tag)}>{tag}</button>
          : <span key={tag} className="pg-tag">{tag}</span>)}
      </span>
    </footer>
  )
}

/** Imagem do texto como figura com legenda (o alt é a legenda) */
export function StyledFigure({ src, caption }: { src: string; caption?: string }) {
  return (
    <span className="pg-figure">
      <img src={src} alt={caption ?? ''} />
      {caption && <span className="pg-caption">{caption}</span>}
    </span>
  )
}

/** Faixa acima do cabeçalho da timeline (nome e descrição no papel do estilo) */
export const styledHeadHtml = (props: StyledHeadProps): string => renderToStaticMarkup(<StyledHead {...props} />)
export const styledFootHtml = (props: StyledFootProps): string => renderToStaticMarkup(<StyledFoot {...props} />)
