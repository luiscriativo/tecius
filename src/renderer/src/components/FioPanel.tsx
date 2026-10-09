/**
 * FioPanel — no fim de um evento:
 * - Fio: as paradas em ordem de data (com avisos: sem local, sem data, não citada
 *   no texto, não encontrada), as menções (ligações que não são paradas),
 *   adicionar parada e "Ver no mapa".
 * - Evento comum: "Transformar em fio" (as ligações do texto viram as paradas).
 * - "Nos fios": os fios de que este evento faz parte.
 * Alterações só fora da edição (`editable`); gravam a lista `fio:` no cabeçalho.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Map as MapIcon, Plus, Spline } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useFio } from '@/hooks/useFio'
import { useOpenEvent } from '@/hooks/useOpenEvent'
import { useI18n } from '@/hooks/useI18n'
import { useNotifications } from '@/hooks/useNotifications'
import { useEventIndexStore } from '@/stores/useEventIndexStore'
import { useTimelineStore } from '@/stores/useTimelineStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { parseChroniclerDate } from '@/utils/chroniclerDate'
import { parseLocation } from '@/utils/location'
import { linkTargets, withoutStop } from '@/utils/fio'
import { docKey, suggestWikiTargets, wikiTextFor, type VaultEventDoc } from '@/utils/wikiLinks'
import { cn } from '@/utils/cn'

interface Props {
  filePath: string
  slug: string
  compact?: boolean
  /** Permite alterar (fora da edição, eventos que não são trecho de chronicle) */
  editable?: boolean
  /** Depois de gravar: o evento aberto relê o arquivo */
  onChanged?: () => void
}

const dateOf = (d: VaultEventDoc | null) => (d?.date ? parseChroniclerDate(d.date).display : '')

export function FioPanel({ filePath, slug, compact, editable, onChanged }: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const openDoc = useOpenEvent()
  const { notify } = useNotifications()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const { self, fio, inFios, docs } = useFio({ filePath, slug })
  const [adding, setAdding] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)

  const save = async (list: string[] | null) => {
    setBusy(true)
    try {
      const r = await window.electronAPI.invoke<{ success: boolean; error?: string }>('fs:set-fio', filePath, list)
      if (!r.success) throw new Error(r.error)
      if (vaultPath) await useEventIndexStore.getState().refresh(vaultPath)
      onChanged?.()
    } catch (err) {
      notify.error(t('fio_save_error'), String(err))
    } finally {
      setBusy(false)
    }
  }

  const suggestions = useMemo(() => {
    if (adding === null || !self) return []
    const taken = new Set([docKey(self), ...(fio?.stops.flatMap((s) => (s.doc ? [docKey(s.doc)] : [])) ?? [])])
    return suggestWikiTargets(adding, docs, self.timelineDir, 12).filter((d) => !taken.has(docKey(d))).slice(0, 6)
  }, [adding, docs, self, fio])

  const openMap = () => {
    const s = useTimelineStore.getState()
    s.setMapFio({ filePath, slug })
    s.setViewMode('map')
    navigate('/timeline')
  }

  const pad = compact ? 'mt-6 pt-4' : 'mt-10 pt-6'
  const title = (icon: ReactNode, label: string, extra?: ReactNode) => (
    <h3 className="flex items-center gap-1.5 font-mono text-2xs tracking-wider uppercase text-chr-muted mb-3">{icon} {label} {extra}</h3>
  )

  const inFiosSection = inFios.length > 0 && (
    <section className={cn(pad, 'border-t border-chr-subtle')} data-testid="in-fios">
      {title(<Spline size={11} strokeWidth={1.5} />, t('fio_in_fios'), <span className="text-chr-secondary">{inFios.length}</span>)}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {inFios.map((f) => (
          <button key={docKey(f)} type="button" onClick={() => void openDoc(f)} className="text-sm text-chr-primary hover:underline">
            {f.title} <span className="font-mono text-2xs text-chr-muted">{f.timelineTitle}</span>
          </button>
        ))}
      </div>
    </section>
  )

  if (!self) return null
  if (!fio) {
    const canCreate = editable && !self.anchor
    return (
      <>
        {inFiosSection}
        {canCreate && (
          <button type="button" disabled={busy} data-testid="fio-create" title={t('fio_create_hint')}
            onClick={() => void save(linkTargets(self.body ?? '').filter((x, i, a) => a.indexOf(x) === i))}
            className={cn(compact ? 'mt-4' : 'mt-6', 'flex items-center gap-1.5 font-mono text-2xs text-chr-muted hover:text-chr-primary transition-colors')}>
            <Spline size={12} strokeWidth={1.5} /> {t('fio_create')}
          </button>
        )}
      </>
    )
  }

  const withLoc = fio.stops.filter((s) => s.doc && parseLocation(s.doc.location) && s.doc.date).length
  return (
    <>
      <section className={cn(pad, 'border-t border-chr-subtle')} data-testid="fio-panel">
        <div className="flex items-center gap-3 mb-3">
          {title(<Spline size={11} strokeWidth={1.5} />, t('fio_label'), <span className="text-chr-secondary">{(fio.stops.length === 1 ? t('fio_stops_one') : t('fio_stops_count', { count: fio.stops.length }))}</span>)}
          <div className="flex-1" />
          {withLoc > 0 && (
            <button type="button" onClick={openMap} data-testid="fio-map"
              className="-mt-3 flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-chr-subtle font-mono text-2xs text-chr-primary hover:bg-hover">
              <MapIcon size={11} strokeWidth={1.5} /> {t('fio_open_map')}
            </button>
          )}
        </div>

        {fio.stops.length === 0 && <p className="font-mono text-2xs text-chr-muted mb-2">{t('fio_empty')}</p>}
        <ol className="space-y-0.5">
          {fio.stops.map((s, i) => {
            const loc = s.doc ? parseLocation(s.doc.location) : null
            const notes = [
              !s.doc && t('fio_not_found'),
              s.doc && !s.doc.date && t('wiki_undated'),
              s.doc && !loc && t('fio_no_place'),
              !s.inText && t('fio_not_in_text'),
            ].filter(Boolean)
            return (
              <li key={s.target + i} className="group flex items-baseline gap-3 -mx-2 px-2 py-1 rounded-sm hover:bg-hover" data-testid="fio-stop">
                <span className="w-24 shrink-0 font-mono text-2xs text-timeline-chronicle-text">{dateOf(s.doc)}</span>
                <span className="min-w-0 flex-1">
                  {s.doc
                    ? <button type="button" onClick={() => void openDoc(s.doc!)} className="text-sm text-chr-primary hover:underline text-left">{s.doc.title}</button>
                    : <span className="text-sm text-chr-muted line-through">{s.target}</span>}
                  <span className="block font-mono text-2xs text-chr-muted truncate">
                    {[loc?.name, s.doc && s.doc.timelineDir !== self.timelineDir ? s.doc.timelineTitle : null].filter(Boolean).join(' · ')}
                    {notes.length > 0 && <span className="text-chr-secondary">{loc?.name ? ' · ' : ''}{notes.join(' · ')}</span>}
                  </span>
                </span>
                {editable && (
                  <button type="button" disabled={busy}
                    onClick={() => void save(withoutStop(self.fio!, s.target, docs, self.timelineDir))}
                    className="shrink-0 font-mono text-2xs text-chr-muted hover:text-chr-primary opacity-0 group-hover:opacity-100 focus:opacity-100"
                    data-testid="fio-stop-remove">
                    {s.inText ? t('fio_make_mention') : t('fio_remove')}
                  </button>
                )}
              </li>
            )
          })}
        </ol>

        {fio.mentions.length > 0 && (
          <div className="mt-4" data-testid="fio-mentions">
            <p className="font-mono text-2xs tracking-wider uppercase text-chr-muted mb-1">{t('fio_mentions')}</p>
            {fio.mentions.map((d) => (
              <div key={docKey(d)} className="group flex items-baseline gap-3 -mx-2 px-2 py-1 rounded-sm hover:bg-hover">
                <span className="w-24 shrink-0 font-mono text-2xs text-chr-muted">{dateOf(d)}</span>
                <button type="button" onClick={() => void openDoc(d)} className="min-w-0 flex-1 truncate text-left text-sm text-chr-secondary hover:underline">{d.title}</button>
                {editable && (
                  <button type="button" disabled={busy} onClick={() => void save([...self.fio!, wikiTextFor(d, docs)])}
                    className="shrink-0 font-mono text-2xs text-chr-muted hover:text-chr-primary" data-testid="fio-include">
                    {t('fio_include')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {editable && (
          <div className="mt-3 flex items-center gap-4">
            {adding === null ? (
              <>
                <button type="button" onClick={() => { setAdding(''); setSel(0) }} data-testid="fio-add"
                  className="flex items-center gap-1 font-mono text-2xs text-chr-muted hover:text-chr-primary">
                  <Plus size={11} /> {t('fio_add')}
                </button>
                <div className="flex-1" />
                <button type="button" disabled={busy} onClick={() => void save(null)} data-testid="fio-remove-all"
                  className="font-mono text-2xs text-chr-muted hover:text-chr-primary">{t('fio_undo')}</button>
              </>
            ) : (
              <div className="relative w-full max-w-sm">
                <input autoFocus value={adding} onChange={(e) => { setAdding(e.target.value); setSel(0) }} placeholder={t('fio_add_placeholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setAdding(null)
                    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => (v + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % Math.max(1, suggestions.length)) }
                    else if (e.key === 'Enter' && suggestions[sel]) { void save([...self.fio!, wikiTextFor(suggestions[sel], docs)]); setAdding(null) }
                  }}
                  onBlur={() => setTimeout(() => setAdding(null), 150)}
                  className="w-full px-2 py-1 rounded-sm bg-vault border border-chr-subtle text-sm text-chr-primary focus:outline-none focus:border-chr"
                  data-testid="fio-add-input" />
                {suggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 chr-card shadow-card-hover py-1">
                    {suggestions.map((d, i) => (
                      <button key={docKey(d)} type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSel(i)}
                        onClick={() => { void save([...self.fio!, wikiTextFor(d, docs)]); setAdding(null) }}
                        className={cn('w-full text-left px-3 py-1.5', i === sel && 'bg-hover')}>
                        <span className="block text-sm text-chr-primary truncate">{d.title}</span>
                        <span className="block font-mono text-2xs text-chr-muted truncate">{[dateOf(d), d.timelineTitle].filter(Boolean).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      {inFiosSection}
    </>
  )
}
