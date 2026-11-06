/**
 * Menu "Layout" da página do evento: largura da página (% do painel) e tamanho
 * do texto (px). As duas são preferências do app (useAppStore), valem para
 * todos os arquivos e ficam salvas.
 */

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { useAppStore, DEFAULT_READING_WIDTH, DEFAULT_TEXT_SIZE } from '@/stores/useAppStore'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/utils/cn'

export function LayoutMenu() {
  const { t } = useI18n()
  const readingWidth = useAppStore((s) => s.readingWidth)
  const textSize = useAppStore((s) => s.textSize)
  const setReadingWidth = useAppStore((s) => s.setReadingWidth)
  const setTextSize = useAppStore((s) => s.setTextSize)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const row = (label: string, value: number, unit: string, min: number, max: number, step: number, onChange: (n: number) => void, testId: string) => (
    <label className="block">
      <span className="flex items-center justify-between mb-1">
        <span className="font-mono text-2xs uppercase tracking-wider text-chr-muted">{label}</span>
        <span className="font-mono text-xs text-chr-secondary tabular-nums">{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-chr-primary cursor-pointer" />
    </label>
  )

  const isDefault = readingWidth === DEFAULT_READING_WIDTH && textSize === DEFAULT_TEXT_SIZE
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} title={t('layout_menu_hint')}
        aria-haspopup="dialog" aria-expanded={open} data-testid="layout-menu"
        className={cn('flex items-center gap-1 px-2 py-1 rounded-sm border transition-colors',
          open ? 'border-chr-subtle text-chr-primary bg-active' : 'border-transparent text-chr-muted hover:text-chr-secondary hover:border-chr-subtle')}>
        <SlidersHorizontal size={12} strokeWidth={1.5} />
        <span className="font-mono text-2xs tabular-nums">{readingWidth}% · {textSize}px</span>
      </button>
      {open && (
        <div role="dialog" aria-label={t('layout_menu')} className="absolute right-0 top-full mt-1 z-30 w-64 chr-card shadow-card-hover p-3 space-y-3">
          {row(t('reading_width'), readingWidth, '%', 30, 100, 5, setReadingWidth, 'reading-width')}
          {row(t('text_size_section'), textSize, 'px', 12, 22, 1, setTextSize, 'text-size-px')}
          <button type="button" disabled={isDefault} onClick={() => { setReadingWidth(DEFAULT_READING_WIDTH); setTextSize(DEFAULT_TEXT_SIZE) }}
            className="flex items-center gap-1 font-mono text-2xs text-chr-muted hover:text-chr-primary transition-colors disabled:opacity-40 disabled:hover:text-chr-muted">
            <RotateCcw size={10} strokeWidth={1.5} />{t('layout_reset')}
          </button>
        </div>
      )}
    </div>
  )
}
