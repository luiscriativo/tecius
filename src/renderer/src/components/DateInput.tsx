import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { cn } from '../utils/cn'
import { parseChroniclerDate, normalizeNaturalDate } from '../utils/chroniclerDate'

interface DateInputProps {
  value: string                  // AAAA | AAAA-MM | AAAA-MM-DD  (formato de armazenamento)
  onChange: (v: string) => void  // chamado só com datas válidas (ou '' ao limpar)
  placeholder?: string
  className?: string
  onFocus?: () => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}

type DateFormat = 'dmy' | 'iso'

function getFormat(language: string): DateFormat {
  return language === 'en' ? 'iso' : 'dmy'
}

// Valor armazenado → texto exibido
// iso: sem conversão (AAAA-MM-DD) · dmy: DD/MM/AAAA, MM/AAAA ou AAAA
function isoToDisplay(iso: string, fmt: DateFormat): string {
  if (!iso || fmt === 'iso') return iso
  if (/[a-z]/i.test(iso)) return iso   // tempo profundo ("66 Ma") é exibido como está
  if (iso.startsWith('-')) {            // antes de Cristo: "-44-03-15" → "15/03/44 a.C."
    const inner = isoToDisplay(iso.slice(1), fmt)
    return `${inner} a.C.`
  }
  const parts = iso.split('-')
  const [y, m, d] = parts
  if (parts.length === 3 && d) return `${d}/${m}/${y}`
  if (parts.length === 2 && m) return `${m}/${y}`
  return iso
}

// ── Interpretação do texto digitado ──────────────────────────────────────────

type Parsed =
  | { status: 'empty' }
  | { status: 'incomplete' }                       // ainda digitando (ex: "14/")
  | { status: 'invalid' }                          // estrutura completa, valores impossíveis
  | { status: 'valid'; iso: string; year: number; month?: number; day?: number; deep?: boolean; bce?: boolean }

function daysInMonth(y: number, m: number): number {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

function build(y: string, m?: string, d?: string): Parsed {
  if (!/^\d{1,9}$/.test(y)) return { status: 'invalid' }
  const year = Number(y)
  if (m === undefined) return { status: 'valid', iso: String(year), year }
  if (!/^\d{1,2}$/.test(m)) return { status: 'invalid' }
  const month = Number(m)
  if (month < 1 || month > 12) return { status: 'invalid' }
  // Ano sem zeros à esquerda: "0123" seria lido como octal pelo YAML
  const ym = `${year}-${String(month).padStart(2, '0')}`
  if (d === undefined) return { status: 'valid', iso: ym, year, month }
  if (!/^\d{1,2}$/.test(d)) return { status: 'invalid' }
  const day = Number(d)
  if (day < 1 || day > daysInMonth(year, month)) return { status: 'invalid' }
  return { status: 'valid', iso: `${ym}-${String(day).padStart(2, '0')}`, year, month, day }
}

/**
 * Datas parciais são suportadas pelo vault (ano, mês/ano, data completa).
 * Quem digita separadores define os grupos; sem separador, vale a quantidade de dígitos.
 *   dmy: "1789" · "07/1789" · "14/07/1789"   (sem barra: 4 → ano, 6 → MMAAAA, 8 → DDMMAAAA)
 *   iso: "1789" · "1789-07" · "1789-07-14"   (sem hífen: 4 → ano, 6 → AAAAMM, 8 → AAAAMMDD)
 */
function parseDateText(text: string, fmt: DateFormat): Parsed {
  const t = text.trim()
  if (!t) return { status: 'empty' }
  // "12 mil anos", "há 66 milhões de anos" → formato curto gravado no arquivo
  const natural = normalizeNaturalDate(t)
  if (natural) return parseCore(natural, fmt)
  const p = parseCore(t, fmt)
  // Com letras e ainda sem sentido: o usuário provavelmente está digitando palavras
  if (p.status === 'invalid' && /[a-zà-ú]/i.test(t)) return { status: 'incomplete' }
  return p
}

function parseCore(text: string, fmt: DateFormat): Parsed {
  const t = text.trim()
  if (!t) return { status: 'empty' }

  // Tempo profundo: "66 Ma", "12 ka", "1,2 Ga" (armazenado como texto normalizado)
  const deep = t.match(/^(\d+(?:[.,]\d+)?)\s*(ka|ma|ga|mya)$/i)
  if (deep) {
    const unit = { ka: 'ka', ma: 'Ma', ga: 'Ga', mya: 'Ma' }[deep[2].toLowerCase()] ?? 'Ma'
    const iso = `${deep[1].replace(',', '.')} ${unit}`
    return { status: 'valid', iso, year: parseChroniclerDate(iso).year, deep: true }
  }
  if (/^\d+(?:[.,]\d+)?\s*[kmg]?$/i.test(t) && /[.,]|\s|[kmg]$/i.test(t)) return { status: 'incomplete' }

  // Antes de Cristo: "500 a.C.", "15/03/44 a.C.", "500 BC" ou "-500"
  const bce = t.match(/^(.*?)\s*(a\.?\s*c\.?|bce?)$/i) ?? (/^-\d/.test(t) ? [t, t.slice(1)] : null)
  if (bce) {
    const inner = parseCore(bce[1], fmt)
    if (inner.status !== 'valid' || inner.deep || inner.bce) return inner.status === 'valid' ? { status: 'invalid' } : inner
    return { ...inner, iso: `-${inner.iso}`, year: -inner.year, bce: true }
  }
  if (/\s*(a\.?\s*c?|b(c)?)$/i.test(t) && /\d/.test(t)) return { status: 'incomplete' } // digitando "a.C."

  if (/[/.-]/.test(t)) {
    const groups = t.split(/[/.-]/)
    if (groups.some((g) => g === '')) return { status: 'incomplete' }
    if (groups.length > 3) return { status: 'invalid' }
    if (fmt === 'dmy') {
      if (groups.length === 2) {
        const p = build(groups[1], groups[0])
        // "14/07" pode ser o começo de "14/07/1789" — não é erro ainda
        const maybeDayMonth = groups[1].length <= 2 && /^\d{1,2}$/.test(groups[0]) && Number(groups[0]) <= 31
        return p.status === 'invalid' && maybeDayMonth ? { status: 'incomplete' } : p
      }
      if (groups.length === 3) return build(groups[2], groups[1], groups[0])
    } else {
      if (groups.length === 2) return build(groups[0], groups[1])
      if (groups.length === 3) return build(groups[0], groups[1], groups[2])
    }
    return build(groups[0])
  }

  // Só dígitos: durante a digitação de uma data completa os estados
  // intermediários não são erro — só 8 dígitos inválidos contam como inválido.
  let parsed: Parsed
  if (t.length <= 4) parsed = build(t)
  else if (t.length <= 6) parsed = fmt === 'dmy' ? build(t.slice(2), t.slice(0, 2)) : build(t.slice(0, 4), t.slice(4))
  else parsed = fmt === 'dmy'
    ? build(t.slice(4), t.slice(2, 4), t.slice(0, 2))
    : build(t.slice(0, 4), t.slice(4, 6), t.slice(6))
  if (parsed.status === 'invalid' && t.length < 8) return { status: 'incomplete' }
  return parsed
}

// ── Prévia ("→ 14 de julho de 1789") ─────────────────────────────────────────

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function describe(p: Parsed, lang: string): { text: string; error?: boolean } | null {
  const en = lang === 'en'
  if (p.status === 'empty') return null
  if (p.status === 'invalid') return { text: en ? 'invalid date' : 'data inválida', error: true }
  if (p.status === 'incomplete') return null
  if (p.deep || p.bce) return { text: parseChroniclerDate(p.iso).display }
  const months = en ? MONTHS_EN : MONTHS_PT
  if (p.day !== undefined && p.month !== undefined) {
    return { text: en ? `${months[p.month - 1]} ${p.day}, ${p.year}` : `${p.day} de ${months[p.month - 1]} de ${p.year}` }
  }
  if (p.month !== undefined) return { text: en ? `${months[p.month - 1]} ${p.year}` : `${months[p.month - 1]} de ${p.year}` }
  return { text: en ? `year ${p.year}` : `ano ${p.year}` }
}

// ── Ajuda: formatos aceitos ──────────────────────────────────────────────────

const EXAMPLES: Record<DateFormat, Array<[string, string]>> = {
  dmy: [
    ['Data completa', '14/07/1789'],
    ['Mês e ano', '07/1789'],
    ['Só o ano', '1789'],
    ['Antes de Cristo', '500 a.C.'],
    ['Milhares de anos atrás', '12 mil anos'],
    ['Milhões de anos atrás', '66 milhões de anos'],
  ],
  iso: [
    ['Full date', '1789-07-14'],
    ['Month and year', '1789-07'],
    ['Year only', '1789'],
    ['Before Christ', '500 BC'],
    ['Thousands of years ago', '12 thousand years ago'],
    ['Millions of years ago', '66 million years ago'],
  ],
}

// ── Componente ───────────────────────────────────────────────────────────────

export function DateInput({ value, onChange, placeholder, className, onFocus, onBlur }: DateInputProps) {
  const language = useAppStore((s) => s.language)
  const fmt = getFormat(language)
  const [display, setDisplay] = useState(() => isoToDisplay(value, fmt))
  const [focused, setFocused] = useState(false)
  const lastEmitted = useRef<string>(value)
  const valueAtFocus = useRef<string>(value) // para reverter se sair com data inválida

  // Sincroniza quando o pai muda o valor externamente (ex: carregar outro evento)
  useEffect(() => {
    if (value !== lastEmitted.current) {
      setDisplay(isoToDisplay(value, fmt))
      lastEmitted.current = value
    }
  }, [value, fmt])

  // Reconverte o display quando o idioma muda
  useEffect(() => {
    setDisplay(isoToDisplay(lastEmitted.current, fmt))
  }, [fmt])

  const parsed = parseDateText(display, fmt)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => applyText(e.target.value)

  const applyText = (text: string) => {
    // Digitação livre, sem reformatar enquanto digita
    setDisplay(text)
    // Só repassa datas válidas — valores intermediários não chegam ao arquivo
    const p = parseDateText(text, fmt)
    const next = p.status === 'empty' ? '' : p.status === 'valid' ? p.iso : null
    if (next !== null && next !== lastEmitted.current) {
      lastEmitted.current = next
      onChange(next)
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false)
    // Saiu com data inválida/incompleta: volta ao valor de antes da edição
    // (os estados intermediários, ex: "31" de "31/02/1769", não devem ficar)
    const p = parseDateText(display, fmt)
    if (p.status === 'invalid' || p.status === 'incomplete') {
      if (lastEmitted.current !== valueAtFocus.current) {
        lastEmitted.current = valueAtFocus.current
        onChange(valueAtFocus.current)
      }
    }
    // Normaliza a exibição ("7/1789" → "07/1789")
    setDisplay(isoToDisplay(lastEmitted.current, fmt))
    onBlur?.(e)
  }

  const hint = focused ? describe(parsed, language) : null
  // Sem data válida ainda (vazio, incompleto ou inválido): mostra os formatos aceitos
  const showHelp = focused && parsed.status !== 'valid'
  const ph = placeholder ?? (fmt === 'iso' ? 'YYYY-MM-DD' : 'DD/MM/AAAA')

  return (
    // Wrapper só para posicionar a prévia; mantém o layout do input (largura total quando w-full)
    <span className={cn('relative', /\bw-full\b/.test(className ?? '') ? 'block' : 'inline-block')}>
      <input
        type="text"
        value={display}
        onChange={handleChange}
        onFocus={() => { setFocused(true); valueAtFocus.current = lastEmitted.current; onFocus?.() }}
        onBlur={handleBlur}
        placeholder={ph}
        maxLength={40}
        spellCheck={false}
        aria-invalid={parsed.status === 'invalid' || undefined}
        className={className}
      />
      {showHelp && (
        <span
          className="absolute left-0 top-full mt-1 z-30 w-[19rem] px-2.5 py-2 rounded-sm border border-chr-subtle bg-surface shadow-card font-mono text-2xs normal-case tracking-normal text-left"
          onMouseDown={(e) => e.preventDefault()}  // não tira o foco do campo
          data-testid="date-help"
        >
          {hint?.error && <span className="block text-red-400 mb-1.5">→ {hint.text}</span>}
          <span className="block text-chr-muted mb-1">{language === 'en' ? 'Accepted formats' : 'Formatos aceitos'}</span>
          {EXAMPLES[fmt].map(([label, example]) => (
            <span key={example} className="flex items-baseline justify-between gap-2 py-0.5">
              <span className="text-chr-muted">{label}</span>
              <button type="button" onClick={() => applyText(example)}
                className="text-chr-primary hover:text-timeline-chronicle-text underline decoration-dotted underline-offset-2 whitespace-nowrap">
                {example}
              </button>
            </span>
          ))}
        </span>
      )}
      {hint && !showHelp && (
        <span
          className={cn(
            'absolute left-0 top-full mt-1 z-30 pointer-events-none whitespace-nowrap',
            'px-1.5 py-0.5 rounded-sm border bg-surface shadow-card font-mono text-2xs normal-case tracking-normal',
            hint.error ? 'border-red-400/40 text-red-400' : 'border-chr-subtle text-chr-muted'
          )}
        >
          → {hint.text}
        </span>
      )}
    </span>
  )
}
