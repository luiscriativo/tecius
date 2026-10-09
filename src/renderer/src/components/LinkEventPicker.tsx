/**
 * LinkEventPicker — busca um evento do vault pelo título (para vincular um trecho).
 * ↑↓ escolhem, Enter escolhe, Esc fecha.
 */

import { useEffect, useMemo, useState } from 'react'
import { ensureEventIndex, useEventIndexStore } from '@/stores/useEventIndexStore'
import { useVaultStore } from '@/stores/useVaultStore'
import { useI18n } from '@/hooks/useI18n'
import { parseChroniclerDate } from '@/utils/chroniclerDate'
import { docKey, suggestWikiTargets, type VaultEventDoc } from '@/utils/wikiLinks'
import { cn } from '@/utils/cn'

interface Props {
  /** Timeline do evento editado: os eventos dela primeiro */
  contextDir: string
  /** Eventos que não podem ser escolhidos (o próprio arquivo) */
  excludeFile?: string
  onPick: (doc: VaultEventDoc) => void
  onClose: () => void
}

export function LinkEventPicker({ contextDir, excludeFile, onPick, onClose }: Props) {
  const { t } = useI18n()
  const docs = useEventIndexStore((s) => s.docs)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  useEffect(() => { ensureEventIndex(vaultPath) }, [vaultPath])
  const list = useMemo(() => suggestWikiTargets(q, (docs ?? []).filter((d) => d.filePath !== excludeFile), contextDir, 7),
    [q, docs, contextDir, excludeFile])

  return (
    <div className="relative w-full max-w-sm" data-testid="link-event-picker">
      <input autoFocus value={q} placeholder={t('link_section_ph')}
        onChange={(e) => { setQ(e.target.value); setSel(0) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((v) => (v + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % Math.max(1, list.length))
          } else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel]) }
        }}
        onBlur={() => setTimeout(onClose, 150)}
        className="w-full px-2 py-1.5 rounded-sm bg-vault border border-chr-subtle text-sm text-chr-primary focus:outline-none focus:border-chr" />
      <div className="absolute z-20 left-0 right-0 mt-1 chr-card shadow-card-hover py-1">
        {list.length === 0 && <p className="px-3 py-2 font-mono text-2xs text-chr-muted">{t('wiki_empty')}</p>}
        {list.map((d, i) => (
          <button key={docKey(d)} type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => onPick(d)}
            className={cn('w-full text-left px-3 py-1.5', i === sel && 'bg-hover')}>
            <span className="block text-sm text-chr-primary truncate">{d.title}</span>
            <span className="block font-mono text-2xs text-chr-muted truncate">
              {[d.date ? parseChroniclerDate(d.date).display : t('wiki_undated'), d.place, d.timelineTitle].filter(Boolean).join(' · ')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
