import { useEffect, useRef, useState, useCallback } from 'react'
import {
  FolderOpen,
  BookOpen,
  CalendarClock,
  Layers,
  ScanLine,
  List,
  Tag,
  Trash2,
  FileDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useVault } from '../hooks/useVault'
import { useI18n } from '../hooks/useI18n'
import type { TranslationKey } from '../i18n/translations'
import { useAppStore } from '../stores/useAppStore'

// ── Slides de dica ────────────────────────────────────────────
const SLIDES = [
  { icon: FolderOpen, title: 'slide_vault_title', desc: 'slide_vault_desc' },
  { icon: BookOpen, title: 'slide_timelines_title', desc: 'slide_timelines_desc' },
  { icon: CalendarClock, title: 'slide_events_title', desc: 'slide_events_desc' },
  { icon: Layers, title: 'slide_chronicles_title', desc: 'slide_chronicles_desc' },
  { icon: ScanLine, title: 'slide_canvas_title', desc: 'slide_canvas_desc' },
  { icon: List, title: 'slide_list_title', desc: 'slide_list_desc' },
  { icon: Tag, title: 'slide_categories_title', desc: 'slide_categories_desc' },
  { icon: Trash2, title: 'slide_trash_title', desc: 'slide_trash_desc' },
  { icon: FileDown, title: 'slide_pdf_title', desc: 'slide_pdf_desc' },
] as const satisfies ReadonlyArray<{ icon: unknown; title: TranslationKey; desc: TranslationKey }>

const AUTOPLAY_INTERVAL = 4500

export default function VaultSetup() {
  const { pickAndLoadVault, isLoading, error } = useVault()
  const { t } = useI18n()
  const appVersion = useAppStore((s) => s.appVersion)

  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback((index: number) => {
    if (index === current) return
    setFading(true)
    setTimeout(() => {
      setCurrent(index)
      setFading(false)
    }, 180)
  }, [current])

  const prev = useCallback(() => {
    goTo((current - 1 + SLIDES.length) % SLIDES.length)
  }, [current, goTo])

  const next = useCallback(() => {
    goTo((current + 1) % SLIDES.length)
  }, [current, goTo])

  // Auto-avanço
  useEffect(() => {
    if (paused) return
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % SLIDES.length)
    }, AUTOPLAY_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [paused, current])

  // Navegação por teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prev, next])

  const slide = SLIDES[current]
  const Icon = slide.icon

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 py-14 bg-vault">

      {/* Título */}
      <div className="text-center space-y-2">
        <h1 className="font-serif text-display text-chr-primary tracking-tight">Tecius</h1>
        <p className="text-chr-secondary text-sm max-w-xs leading-relaxed">
          {t('vault_desc')}
        </p>
      </div>

      <div className="w-10 border-t border-chr-subtle" />

      {/* Carrossel */}
      <div
        className="w-full max-w-xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Card do slide */}
        <div className="chr-card px-8 py-7 flex flex-col gap-6 min-h-[200px]">

          {/* Conteúdo com fade — duas colunas */}
          <div
            className="flex gap-7 flex-1 transition-opacity"
            style={{ opacity: fading ? 0 : 1, transitionDuration: '180ms' }}
          >
            {/* Coluna esquerda: ícone + contador */}
            <div className="flex flex-col items-center gap-3 pt-0.5 shrink-0">
              <Icon size={26} className="text-chr-muted" strokeWidth={1.3} />
              <span className="font-mono text-2xs text-chr-muted tabular-nums">
                {String(current + 1).padStart(2, '0')}/{SLIDES.length}
              </span>
            </div>

            {/* Divisor vertical */}
            <div className="w-px bg-chr-subtle shrink-0" />

            {/* Coluna direita: título + descrição */}
            <div className="flex flex-col gap-2 justify-center">
              <h3 className="font-serif text-lg text-chr-primary leading-snug">
                {t(slide.title)}
              </h3>
              <p className="text-sm text-chr-secondary leading-relaxed">
                {t(slide.desc)}
              </p>
            </div>
          </div>

          {/* Controles: seta ← · dots · seta → */}
          <div className="flex items-center justify-between pt-1 border-t border-chr-subtle">
            <button
              onClick={prev}
              className="text-chr-muted hover:text-chr-primary transition-colors duration-100 p-1"
              aria-label={t('slide_prev')}
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={t('slide_goto', { n: i + 1 })}
                  className={cn(
                    'rounded-full transition-all duration-300',
                    i === current
                      ? 'w-4 h-1.5 bg-chr-primary'
                      : 'w-1.5 h-1.5 bg-chr-subtle hover:bg-chr-muted'
                  )}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="text-chr-muted hover:text-chr-primary transition-colors duration-100 p-1"
              aria-label={t('slide_next')}
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <p className="font-mono text-xs text-chr-muted border border-chr-subtle rounded-sm px-3 py-2 max-w-sm text-center">
          {error}
        </p>
      )}

      {/* CTA */}
      <button
        disabled={isLoading}
        onClick={pickAndLoadVault}
        className="inline-flex items-center gap-2 px-6 py-2.5 border border-chr-strong text-chr-primary font-sans text-sm font-medium rounded-sm hover:bg-active transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FolderOpen size={15} strokeWidth={1.5} />
        {isLoading ? t('loading') : t('choose_vault_folder')}
      </button>

      {/* Versão */}
      <p className="font-mono text-2xs text-chr-muted tracking-wider uppercase">
        Tecius {appVersion ? `v${appVersion}` : ''}
      </p>

    </div>
  )
}
