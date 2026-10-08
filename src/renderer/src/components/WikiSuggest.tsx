/**
 * WikiSuggest — lista que abre ao digitar `[[` no texto de um evento.
 *
 * - Sugere eventos de todo o vault pelo título (os da timeline atual primeiro),
 *   com data e timeline; a última opção cria um evento novo com o que foi digitado.
 * - ↑↓ escolhem, Enter/Tab inserem `[[Título]]`, Esc fecha (até o texto mudar).
 * - Escuta o textarea com foco (campo principal ou trecho de chronicle): as teclas
 *   são tratadas antes dos atalhos do editor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useEventIndexStore, ensureEventIndex } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useVault } from '@/hooks/useVault'
import { useI18n } from '@/hooks/useI18n'
import { parseChroniclerDate } from '@/utils/chroniclerDate'
import { applyTextEdit, caretRect } from '@/utils/textareaEdit'
import { completeWikiLink, normTitle, openWikiQuery, suggestWikiTargets, wikiTextFor, type VaultEventDoc } from '@/utils/wikiLinks'
import { cn } from '@/utils/cn'

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  /** Pasta da timeline do evento editado: sugestões dela primeiro e onde nasce o evento criado */
  contextDir: string
  /** Troca o texto inteiro se a edição "como digitada" não for possível */
  fallback: (v: string) => void
}

type Item = { doc: VaultEventDoc } | { create: string }

export function WikiSuggest({ textareaRef, contextDir, fallback }: Props) {
  const { t } = useI18n()
  const docs = useEventIndexStore((s) => s.docs)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const { reloadVault } = useVault()
  const [open, setOpen] = useState<{ query: string; start: number; left: number; top: number; above: boolean } | null>(null)
  const [sel, setSel] = useState(0)
  const dismissedAt = useRef<number | null>(null)
  const busy = useRef(false)

  // Abre/fecha conforme o texto antes do cursor tem um `[[` aberto
  const update = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) { setOpen(null); return }
    const caret = ta.selectionStart
    const query = openWikiQuery(ta.value.slice(0, caret))
    if (query === null) { dismissedAt.current = null; setOpen(null); return }
    const start = caret - query.length - 2
    if (dismissedAt.current === start) { setOpen(null); return }
    const c = caretRect(ta, start)
    const above = c.top + c.height + 260 > window.innerHeight
    setOpen((prev) => (prev && prev.start === start && prev.query === query ? prev
      : { query, start, left: Math.min(c.left, window.innerWidth - 340), top: above ? c.top - 6 : c.top + c.height + 6, above }))
  }, [textareaRef])

  useEffect(() => {
    const evs = ['selectionchange', 'input', 'mouseup', 'focusin', 'focusout'] as const
    const h = () => requestAnimationFrame(update)
    evs.forEach((n) => document.addEventListener(n, h, true))
    return () => evs.forEach((n) => document.removeEventListener(n, h, true))
  }, [update])
  useEffect(() => { if (open) ensureEventIndex(vaultPath) }, [open, vaultPath])
  useEffect(() => { setSel(0) }, [open?.query])

  const items: Item[] = useMemo(() => {
    if (!open) return []
    const list = docs ? suggestWikiTargets(open.query, docs, contextDir, 7) : []
    const q = open.query.trim()
    const exists = docs?.some((d) => normTitle(d.title) === normTitle(q))
    return [...list.map((doc) => ({ doc })), ...(q && !exists ? [{ create: q }] : [])]
  }, [open, docs, contextDir])

  const choose = useCallback(async (item: Item) => {
    const ta = textareaRef.current
    if (!ta || !open || busy.current) return
    const caret = ta.selectionStart
    if ('doc' in item) {
      applyTextEdit(ta, completeWikiLink(ta.value, caret, wikiTextFor(item.doc, docs ?? [])), fallback)
      setOpen(null)
      return
    }
    // Cria o evento (sem data) nesta timeline e liga para ele
    busy.current = true
    try {
      const r = await window.electronAPI.invoke<{ success: boolean }>('fs:create-event', contextDir, item.create, undefined, null)
      if (r.success) {
        applyTextEdit(ta, completeWikiLink(ta.value, caret, item.create), fallback)
        setOpen(null)
        if (vaultPath) void useEventIndexStore.getState().refresh(vaultPath)
        void reloadVault()
      }
    } finally {
      busy.current = false
    }
  }, [textareaRef, open, docs, fallback, contextDir, vaultPath, reloadVault])

  // Teclas da lista: antes dos atalhos do editor (captura no documento)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement !== textareaRef.current) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return
        e.preventDefault(); e.stopPropagation()
        setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
      } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && items.length) {
        e.preventDefault(); e.stopPropagation()
        void choose(items[Math.min(sel, items.length - 1)])
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        dismissedAt.current = open.start
        setOpen(null)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, items, sel, choose, textareaRef])

  if (!open) return null
  return (
    <div
      className="fixed z-50 w-80 chr-card shadow-card-hover py-1"
      style={{ left: open.left, top: open.top, transform: open.above ? 'translateY(-100%)' : undefined }}
      onMouseDown={(e) => e.preventDefault()}
      data-testid="wiki-suggest"
    >
      {items.length === 0 && <p className="px-3 py-2 font-mono text-2xs text-chr-muted">{t('wiki_empty')}</p>}
      {items.map((item, i) => {
        const active = i === Math.min(sel, items.length - 1)
        return 'doc' in item ? (
          <button key={item.doc.filePath + item.doc.slug} type="button" onClick={() => void choose(item)} onMouseEnter={() => setSel(i)}
            className={cn('w-full text-left px-3 py-1.5 transition-colors', active && 'bg-hover')}>
            <span className="block text-sm text-chr-primary truncate">{item.doc.title}</span>
            <span className="block font-mono text-2xs text-chr-muted truncate">
              {[item.doc.date ? parseChroniclerDate(item.doc.date).display : '', item.doc.timelineTitle].filter(Boolean).join(' · ')}
            </span>
          </button>
        ) : (
          <button key="create" type="button" onClick={() => void choose(item)} onMouseEnter={() => setSel(i)}
            className={cn('w-full text-left px-3 py-1.5 border-t border-chr-subtle transition-colors', active && 'bg-hover')}>
            <span className="flex items-center gap-1.5 text-sm text-timeline-chronicle-text truncate"><Plus size={12} strokeWidth={1.5} />{t('wiki_create', { title: item.create })}</span>
            <span className="block font-mono text-2xs text-chr-muted">{t('wiki_create_hint')}</span>
          </button>
        )
      })}
      <p className="px-3 pt-1 mt-1 border-t border-chr-subtle font-mono text-[10px] text-chr-muted">{t('wiki_keys')}</p>
    </div>
  )
}
