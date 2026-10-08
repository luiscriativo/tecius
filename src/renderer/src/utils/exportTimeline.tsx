/**
 * Exportação da timeline inteira: monta o conteúdo do documento (capa, índice e
 * um capítulo por arquivo de evento) como HTML estático. O processo principal
 * envolve no modelo, embute as imagens e salva como PDF ou página web.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { formatSpan, formatYear } from './chroniclerDate'
import { stripAnchors } from './anchors'
import { remarkWikiLinks } from './wikiLinks'
import { StaticWikiAnchor } from '../components/WikiLink'
import type { ChroniclerEvent, TimelineData } from '../types/chronicler'

export interface ExportLabels {
  events: (n: number) => string
  noContent: string
}


function Markdown({ body, filePath }: { body: string; filePath: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkWikiLinks]}
      components={{
        a: StaticWikiAnchor,
        img: ({ src, alt }) => <img src={src ? window.electronAPI.resolveAssetPath(filePath, String(src)) : ''} alt={alt ?? ''} />,
        // Títulos do texto ficam abaixo do título do evento (h2) no documento
        h1: ({ children }) => <h3>{children}</h3>,
        h2: ({ children }) => <h3>{children}</h3>,
        h3: ({ children }) => <h4>{children}</h4>,
      }}>
      {stripAnchors(body)}
    </ReactMarkdown>
  )
}

export async function buildTimelineExportHtml(timeline: TimelineData, labels: ExportLabels): Promise<string> {
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
        return (
          <article key={i} id={`ev-${i}`}>
            <div className="date">
              {fm.circa && '~'}{isChronicle ? `${first.date.display} – ${g[g.length - 1].date.display}` : first.date.display}
            </div>
            <h2>{isChronicle ? first.chronicle!.title : fm.title}</h2>
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
              {body.trim() ? <Markdown body={body} filePath={first.filePath} /> : <p className="muted">{labels.noContent}</p>}
            </div>
          </article>
        )
      })}
    </>
  )
  return renderToStaticMarkup(doc)
}
