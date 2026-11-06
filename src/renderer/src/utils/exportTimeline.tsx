/**
 * Exportação da timeline inteira: monta o conteúdo do documento (capa, índice e
 * um capítulo por arquivo de evento) como HTML estático. O processo principal
 * envolve no modelo, embute as imagens e salva como PDF ou página web.
 *
 * No estilo "jornal" o documento é uma edição: cabeçalho em gótica, e cada
 * evento com linha de data, manchete, subtítulo e texto em colunas.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { formatSpan, formatYear } from './chroniclerDate'
import { stripAnchors } from './anchors'
import { remarkWikiLinks } from './wikiLinks'
import { StaticWikiAnchor } from '../components/WikiLink'
import { CORNERS_HTML, FLEURON_SVG } from '../components/journal/Ornaments'
import { AlbumPhoto } from '../components/journal/Photo'
import { StyledHead, StyledFoot, StyledFigure } from '../components/journal/StyledPage'
import { columnsOf, importanceStars, isStyledPreset, presetColumns, formatCoords, resolvePageStyle, normalizeTone } from './pageStyle'
import { dateRangeLabel } from '../components/timeline/EventDot'
import type { ChroniclerEvent, TimelineData } from '../types/chronicler'

export interface ExportLabels {
  events: (n: number) => string
  noContent: string
  importance?: string
  period?: string
  place?: string
  category?: string
}


type Figures = 'journal' | 'album' | 'styled' | false
function Markdown({ body, filePath, journal }: { body: string; filePath: string; journal: Figures }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkWikiLinks]}
      components={{
        a: StaticWikiAnchor,
        img: ({ src, alt }) => {
          const resolved = src ? window.electronAPI.resolveAssetPath(filePath, String(src)) : ''
          if (journal === 'album') return <AlbumPhoto src={resolved} caption={alt} />
          if (journal === 'styled') return <StyledFigure src={resolved} caption={alt} />
          return journal === 'journal'
            ? <span className="pj-figure"><img src={resolved} alt={alt ?? ''} />{alt && <span className="pj-caption">{alt}</span>}</span>
            : <img src={resolved} alt={alt ?? ''} />
        },
        // Títulos do texto ficam abaixo do título do evento (h2) no documento
        h1: ({ children }) => <h3>{children}</h3>,
        h2: ({ children }) => <h3>{children}</h3>,
        h3: ({ children }) => <h4>{children}</h4>,
      }}>
      {stripAnchors(body)}
    </ReactMarkdown>
  )
}

/**
 * Documento da timeline: capa e índice neutros, e um capítulo por arquivo,
 * cada um no estilo do próprio arquivo (`style:` dele, ou o padrão herdado
 * da timeline e do vault). Devolve o HTML e os estilos usados, para o
 * processo principal incluir só o CSS necessário.
 */
export async function buildTimelineExportHtml(timeline: TimelineData, labels: ExportLabels, vaultStyle?: string): Promise<{ bodyHtml: string; styles: string[] }> {
  const styles = new Set<string>()
  const labelsPg = { period: labels.period ?? '', place: labels.place ?? '', category: labels.category ?? '', importance: labels.importance ?? '' }
  // Um capítulo por arquivo (os trechos de um chronicle ficam juntos), na ordem da timeline
  const groups: ChroniclerEvent[][] = []
  const byFile = new Map<string, ChroniclerEvent[]>()
  for (const ev of timeline.events) {
    let g = byFile.get(ev.filePath)
    if (!g) { g = []; byFile.set(ev.filePath, g); groups.push(g) }
    g.push(ev)
  }

  const bodies = new Map<string, string>()
  await Promise.all([...byFile.keys()].map(async (fp) => {
    const r = await window.electronAPI.invoke<{ success: boolean; data?: { body: string } }>('fs:read-event', fp)
    bodies.set(fp, r.success && r.data ? r.data.body : '')
  }))

  const { min, max, spanYears } = timeline.dateRange
  const dated = timeline.events.filter((e) => !e.undated).length
  const period = min && max ? `${formatYear(min.year)} – ${formatYear(max.year)}${spanYears > 0 ? ` (${formatSpan(spanYears)})` : ''}` : ''
  const cols = columnsOf(timeline.meta.columns)

  const doc = (
    <>
      <header className="cover">
        <h1>{timeline.meta.title}</h1>
        {timeline.meta.description && <p className="desc">{timeline.meta.description}</p>}
        <p className="meta mono">{labels.events(timeline.events.length)}{period && dated ? ` · ${period}` : ''}</p>
      </header>

      <ul className="toc">
        {groups.map((g, i) => (
          <li key={i}><a href={`#ev-${i}`}><span className="d">{g[0].date.displayShort}</span>{g[0].chronicle && g.length > 1 ? g[0].chronicle.title : g[0].frontmatter.title}</a></li>
        ))}
      </ul>

      {groups.map((g, i) => {
        const first = g[0]
        const fm = first.frontmatter
        const isChronicle = !!first.chronicle && g.length > 1
        const body = bodies.get(first.filePath) ?? ''
        const tags = fm.tags ?? []
        const title = isChronicle ? first.chronicle!.title : fm.title
        const date = isChronicle ? `${first.date.display} – ${g[g.length - 1].date.display}` : dateRangeLabel(first)
        // O estilo é de cada arquivo (os trechos de um chronicle já herdam o do arquivo)
        const pageStyle = resolvePageStyle(fm.style, timeline.meta.style, vaultStyle)
        const tone = normalizeTone(fm.paper)
        const journal = pageStyle === 'jornal'
        const album = pageStyle === 'album'
        const styled = isStyledPreset(pageStyle)
        if (journal || album || styled) styles.add(pageStyle)
        if (journal) {
          return (
            <article key={i} id={`ev-${i}`} className="page-journal pj-article chapter-styled" data-tone={tone}>
              <div dangerouslySetInnerHTML={{ __html: CORNERS_HTML }} />
              <div className="pj-dateline">
                <span>{[fm.edition, fm.category].filter(Boolean).join(' · ') || ' '}</span>
                <b>{fm.circa ? '~ ' : ''}{date}</b>
                <span className="pj-dateline-right">{first.location?.name ?? ' '}</span>
              </div>
              <h2 className="pj-headline">{title}</h2>
              {fm.deck && <p className="pj-deck">{fm.deck}</p>}
              <div className="pj-fleuron" dangerouslySetInnerHTML={{ __html: FLEURON_SVG }} />
              {isChronicle && (
                <ol className="entries">
                  {g.map((e) => <li key={e.slug}><span className="mono">{e.date.displayShort}</span> — {e.frontmatter.title}</li>)}
                </ol>
              )}
              <div className="pj-cols markdown-content" data-cols={cols}>
                {body.trim() ? <Markdown body={body} filePath={first.filePath} journal="journal" /> : <p className="muted">{labels.noContent}</p>}
              </div>
              {(fm.importance || fm.category || tags.length > 0) && (
                <div className="pj-foot">
                  <span>{labels.importance ?? ''} <span className="pj-stars">{importanceStars(fm.importance)}</span></span>
                  <span className="pj-stamps">
                    {fm.category && <span className="pj-stamp">{fm.category}</span>}
                    {tags.map((tg) => <span key={tg} className="pj-stamp">#{tg}</span>)}
                  </span>
                </div>
              )}
            </article>
          )
        }
        if (styled) {
          const cover = typeof fm['cover-image'] === 'string' && fm['cover-image'].trim()
            ? window.electronAPI.resolveAssetPath(first.filePath, fm['cover-image'].trim()) : ''
          const emblem = typeof fm.emblem === 'string' && fm.emblem.trim() ? window.electronAPI.resolveAssetPath(first.filePath, fm.emblem.trim()) : ''
          return (
            <article key={i} id={`ev-${i}`} className={`page-styled page-${pageStyle} pg-article chapter-styled`} data-tone={tone}>
              <StyledHead as="h2" title={title} kicker={fm.kicker ?? (isChronicle ? first.chronicle!.title : undefined)} edition={fm.edition} deck={fm.deck}
                date={`${fm.circa ? '~ ' : ''}${date}`} place={first.location?.name} coords={first.location ? formatCoords(first.location.lat, first.location.lng) : undefined}
                category={fm.category} importance={fm.importance} coverSrc={cover || undefined} coverCaption={fm['cover-caption']} emblemSrc={emblem || undefined} labels={labelsPg} />
              {isChronicle && (
                <ol className="entries">
                  {g.map((e) => <li key={e.slug}><span className="mono">{e.date.displayShort}</span> — {e.frontmatter.title}</li>)}
                </ol>
              )}
              <div className="pg-body markdown-content" data-cols={columnsOf(timeline.meta.columns, presetColumns(pageStyle))}>
                {body.trim() ? <Markdown body={body} filePath={first.filePath} journal="styled" /> : <p className="muted">{labels.noContent}</p>}
              </div>
              <StyledFoot importance={fm.importance} category={fm.category} tags={tags} importanceLabel={labels.importance ?? ''} />
            </article>
          )
        }
        if (album) {
          const cover = typeof fm['cover-image'] === 'string' && fm['cover-image'].trim()
            ? window.electronAPI.resolveAssetPath(first.filePath, fm['cover-image'].trim()) : ''
          return (
            <article key={i} id={`ev-${i}`} className="page-album pa-article chapter-styled" data-tone={tone}>
              <p className="pa-kicker">{fm.kicker ?? (isChronicle ? first.chronicle!.title : fm.category ?? ' ')}</p>
              <h2 className="pa-title">{title}</h2>
              <p className="pa-date">{fm.circa ? '~ ' : ''}{date}{first.location?.name ? ` · ${first.location.name}` : ''}</p>
              {cover && <AlbumPhoto src={cover} caption={fm['cover-caption']} wide />}
              {isChronicle && (
                <ol className="entries">
                  {g.map((e) => <li key={e.slug}><span className="mono">{e.date.displayShort}</span> — {e.frontmatter.title}</li>)}
                </ol>
              )}
              <div className="pa-body markdown-content">
                {body.trim() ? <Markdown body={body} filePath={first.filePath} journal="album" /> : <p className="muted">{labels.noContent}</p>}
              </div>
              {(fm.importance || fm.category || tags.length > 0) && (
                <div className="pa-foot">
                  <span>{labels.importance ?? ''} <span className="pa-stars">{importanceStars(fm.importance)}</span>{fm.category ? ` · ${fm.category}` : ''}</span>
                  <span className="pa-tags">{tags.map((tg) => <span key={tg} className="pa-tag">{tg}</span>)}</span>
                </div>
              )}
            </article>
          )
        }
        return (
          <article key={i} id={`ev-${i}`} className="chapter">
            <div className="date">
              {fm.circa && '~'}{date}
            </div>
            <h2>{title}</h2>
            {first.location?.name && <div className="loc">📍 {first.location.name}</div>}
            {(fm.category || tags.length > 0) && (
              <div className="chips">
                {fm.category && <span className="chip">{fm.category}</span>}
                {tags.map((tg) => <span key={tg} className="chip">#{tg}</span>)}
              </div>
            )}
            {isChronicle && (
              <ol className="entries">
                {g.map((e) => <li key={e.slug}><span className="mono">{e.date.displayShort}</span> — {e.frontmatter.title}</li>)}
              </ol>
            )}
            <div className="body">
              {body.trim() ? <Markdown body={body} filePath={first.filePath} journal={false} /> : <p className="muted">{labels.noContent}</p>}
            </div>
          </article>
        )
      })}
    </>
  )
  return { bodyHtml: renderToStaticMarkup(doc), styles: [...styles] }
}
