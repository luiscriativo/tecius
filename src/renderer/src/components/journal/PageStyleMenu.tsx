/**
 * Seletor de estilo de página. Um botão "Estilo: Jornal" que abre a lista de
 * presets e dos estilos próprios do vault (_styles/*.css). "Herdado" apaga o
 * `style:` do arquivo, que volta a seguir o nível de cima.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useI18n } from '@/hooks/useI18n'
import { PAGE_PRESETS, normalizeStyleName, normalizeTone } from '@/utils/pageStyle'
import type { TranslationKey } from '@/i18n/translations'

/** Onde gravar o `style:` (mesmo contrato do IPC fs:set-page-style) */
export type PageStyleTarget =
  | { kind: 'vault' }
  | { kind: 'timeline'; dirPath: string }
  | { kind: 'event'; filePath: string }

type Tone = 'light' | 'dark'

interface Props {
  /** Arquivo a gravar (modo normal). No editor, `onPick` recebe a escolha e nada é gravado aqui. */
  target: PageStyleTarget
  /** `style:` escrito no próprio arquivo (undefined = herda) */
  own?: string
  /** Estilo que vale se o arquivo não tiver o seu (o do nível de cima) */
  inherited: string
  /** Chamado depois de gravar, para a tela reler o arquivo */
  onChanged?: () => void | Promise<void>
  /** Modo editor: a escolha vai para o formulário em vez do disco */
  onPick?: (style: string | null) => void
  /** `paper:` do arquivo (light | dark); só eventos têm */
  tone?: string
  onPickTone?: (tone: Tone | null) => void
  className?: string
  /** Botão menor, para as barras do cabeçalho */
  compact?: boolean
  /** Abre o menu para cima (quando o botão fica no fim da página) */
  up?: boolean
}

const PRESET_KEY: Record<string, TranslationKey> = { classico: 'style_classico', jornal: 'style_jornal', album: 'style_album', campo: 'style_campo', dossie: 'style_dossie', iluminura: 'style_iluminura', cartaz: 'style_cartaz', correio: 'style_correio', rosto: 'style_rosto', verbete: 'style_verbete', gazeta: 'style_gazeta', diario: 'style_diario', decreto: 'style_decreto', revista: 'style_revista' }
const TONES: Array<Tone | null> = [null, 'light', 'dark']
const TONE_KEY = (t: Tone | null): TranslationKey => t === 'light' ? 'tone_light' : t === 'dark' ? 'tone_dark' : 'tone_auto'

export function PageStyleMenu({ target, own, inherited, onChanged, onPick, tone, onPickTone, className, compact, up }: Props) {
  const { t } = useI18n()
  const fileTone = normalizeTone(tone) ?? null
  const showTone = !!onPickTone || target.kind === 'event'
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const ownName = normalizeStyleName(own)
  const current = ownName ?? inherited
  const label = (name: string) => PRESET_KEY[name] ? t(PRESET_KEY[name]) : name
  const scopeKey: TranslationKey = target.kind === 'vault' ? 'page_style_set_vault' : target.kind === 'timeline' ? 'page_style_set_timeline' : 'page_style_set_event'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    void window.electronAPI.invoke<{ success: boolean; data?: string[] }>('fs:list-styles')
      .then((r) => { if (r.success && r.data) setCustom(r.data.filter((n) => !(PAGE_PRESETS as readonly string[]).includes(n))) })
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const choose = useCallback(async (style: string | null) => {
    setOpen(false)
    if ((style ?? undefined) === ownName) return
    if (onPick) { onPick(style); return }
    setBusy(true)
    try {
      const r = await window.electronAPI.invoke<{ success: boolean; error?: string }>('fs:set-page-style', target, style)
      if (r.success) await onChanged?.()
    } finally {
      setBusy(false)
    }
  }, [target, ownName, onChanged, onPick])

  const chooseTone = useCallback(async (next: Tone | null) => {
    if (next === fileTone) return
    if (onPickTone) { onPickTone(next); return }
    setBusy(true)
    try {
      const r = await window.electronAPI.invoke<{ success: boolean; error?: string }>('fs:set-page-style', target, next, 'paper')
      if (r.success) await onChanged?.()
    } finally {
      setBusy(false)
    }
  }, [target, fileTone, onChanged, onPickTone])

  const item = (name: string | null, text: string, hint?: string) => {
    const active = name === null ? !ownName : ownName === name
    return (
      <button key={name ?? '_inherit'} type="button" role="menuitemradio" aria-checked={active} onClick={() => void choose(name)}
        className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono hover:bg-hover transition-colors',
          active ? 'text-chr-primary' : 'text-chr-secondary')}>
        <span className="w-3 shrink-0">{active && <Check size={11} strokeWidth={2} />}</span>
        <span className="flex-1 truncate">{text}</span>
        {hint && <span className="text-2xs text-chr-muted truncate">{hint}</span>}
      </button>
    )
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={busy} title={t('page_style_hint')}
        aria-haspopup="menu" aria-expanded={open} data-testid="page-style-menu"
        className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-sm font-mono border border-chr-subtle text-chr-muted hover:border-chr hover:text-chr-secondary transition-colors disabled:opacity-50',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm', open && 'border-chr text-chr-secondary')}>
        <Palette size={compact ? 12 : 13} strokeWidth={1.5} />
        {t('page_style')}: {label(current)}{!ownName && <span className="text-chr-subtle">·</span>}{!ownName && <span className="text-2xs text-chr-subtle">{t('page_style_inherit').toLowerCase()}</span>}
      </button>
      {open && (
        <div role="menu" className={cn('absolute right-0 z-30 w-60 chr-card shadow-card-hover py-1 text-left normal-case tracking-normal', up ? 'bottom-full mb-1' : 'top-full mt-1')} data-testid="page-style-list">
          <div className="px-3 pt-1 pb-1.5 text-2xs font-mono uppercase tracking-wider text-chr-muted">{t(scopeKey)}</div>
          {target.kind !== 'vault' && item(null, t('page_style_inherit'), label(inherited))}
          {PAGE_PRESETS.map((p) => item(p, label(p)))}
          {custom.length > 0 && (
            <>
              <div className="my-1 border-t border-chr-subtle" />
              <div className="px-3 pt-1 pb-1.5 text-2xs font-mono uppercase tracking-wider text-chr-muted">{t('page_style_own')}</div>
              {custom.map((c) => item(c, c))}
            </>
          )}
          {/* Papel claro ou escuro deste arquivo (`paper:`), independente do tema do app */}
          {showTone && (
            <>
              <div className="my-1 border-t border-chr-subtle" />
              <div className="px-3 pt-1 pb-1.5 text-2xs font-mono uppercase tracking-wider text-chr-muted">{t('paper_tone')}</div>
              <div className="flex gap-1 px-3 pb-1.5" role="radiogroup" data-testid="page-tone">
                {TONES.map((tn) => (
                  <button key={tn ?? 'auto'} type="button" role="radio" aria-checked={fileTone === tn} onClick={() => void chooseTone(tn)}
                    className={cn('flex-1 px-2 py-1 rounded-sm border text-2xs font-mono transition-colors',
                      fileTone === tn ? 'border-chr-strong bg-active text-chr-primary' : 'border-chr-subtle text-chr-secondary hover:border-chr hover:bg-hover')}>
                    {t(TONE_KEY(tn))}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
