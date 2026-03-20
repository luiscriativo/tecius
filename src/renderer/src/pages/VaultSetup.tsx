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

// ── Slides de dica ────────────────────────────────────────────
const SLIDES = [
  {
    icon: FolderOpen,
    title: 'Vault = uma pasta',
    desc: 'Escolha qualquer pasta do seu computador. Todos os seus dados são arquivos .md comuns — abertos, editáveis e portáteis.',
  },
  {
    icon: BookOpen,
    title: 'Timelines',
    desc: 'Qualquer subpasta com um arquivo _timeline.md vira uma timeline. Crie quantas quiser e organize-as por tema, período ou projeto.',
  },
  {
    icon: CalendarClock,
    title: 'Eventos',
    desc: 'Cada arquivo .md dentro de uma timeline é um evento. O único campo obrigatório no front matter é date — o restante é opcional.',
  },
  {
    icon: Layers,
    title: 'Chronicles',
    desc: 'Um único arquivo .md pode conter vários eventos. Use o tipo chronicle no front matter para registrar múltiplos acontecimentos de um mesmo assunto num só lugar.',
  },
  {
    icon: ScanLine,
    title: 'Canvas & zoom',
    desc: 'Na visão canvas, use Ctrl+scroll ou os botões − + no rodapé para dar zoom no eixo temporal e inspecionar períodos específicos.',
  },
  {
    icon: List,
    title: 'Visão em lista',
    desc: 'Alterne para a visão em lista quando quiser uma leitura mais densa — com agrupamento por ano e filtros por categoria.',
  },
  {
    icon: Tag,
    title: 'Categorias & importância',
    desc: 'Classifique eventos por categoria (Arte, Ciência, Política…) e importância de 1 a 5 para controlar o peso visual na timeline.',
  },
  {
    icon: Trash2,
    title: 'Lixeira interna',
    desc: 'Eventos deletados vão para a lixeira do vault. Nada é removido permanentemente do disco sem sua confirmação explícita.',
  },
  {
    icon: FileDown,
    title: 'Exportar PDF',
    desc: 'Qualquer timeline pode ser exportada como PDF pela barra de ações. Útil para compartilhar ou arquivar fora do Tecius.',
  },
] as const

const AUTOPLAY_INTERVAL = 4500

export default function VaultSetup() {
  const { pickAndLoadVault, isLoading, error } = useVault()
  const { t } = useI18n()

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
            className="flex gap-7 flex-1 transition-opacity duration-[180ms]"
            style={{ opacity: fading ? 0 : 1 }}
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
                {slide.title}
              </h3>
              <p className="text-sm text-chr-secondary leading-relaxed">
                {slide.desc}
              </p>
            </div>
          </div>

          {/* Controles: seta ← · dots · seta → */}
          <div className="flex items-center justify-between pt-1 border-t border-chr-subtle">
            <button
              onClick={prev}
              className="text-chr-muted hover:text-chr-primary transition-colors duration-100 p-1"
              aria-label="Slide anterior"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-2">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Ir para slide ${i + 1}`}
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
              aria-label="Próximo slide"
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
        Tecius v0.1.0
      </p>

    </div>
  )
}
