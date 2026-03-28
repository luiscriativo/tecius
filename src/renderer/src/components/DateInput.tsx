import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'

interface DateInputProps {
  value: string                  // YYYY-MM-DD  (formato de armazenamento)
  onChange: (v: string) => void  // chamado com YYYY-MM-DD
  placeholder?: string
  className?: string
}

type DateFormat = 'dmy' | 'iso'

function getFormat(language: string): DateFormat {
  return language === 'en' ? 'iso' : 'dmy'
}

// YYYY-MM-DD → string de exibição
// iso: sem conversão (YYYY-MM-DD)
// dmy: DD/MM/AAAA
function isoToDisplay(iso: string, fmt: DateFormat): string {
  if (!iso || fmt === 'iso') return iso
  const parts = iso.split('-')
  const [y, m, d] = parts
  if (parts.length === 3 && d) return `${d}/${m}/${y}`
  if (parts.length === 2 && m) return `${m}/${y}`
  return iso
}

// Dígitos digitados em ordem DD MM AAAA → YYYY-MM-DD
function displayDigitsToIso(digits: string): string {
  if (!digits) return ''
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  if (y) return `${y}-${m}-${d}`
  if (m) return `${m}-${d}`
  return d
}

// Máscara DD/MM/AAAA para dígitos
function maskDmy(digits: string): string {
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

// Máscara YYYY-MM-DD para dígitos (formato ISO — igual ao armazenamento)
function maskIso(digits: string): string {
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

// Dígitos em ordem AAAA MM DD → YYYY-MM-DD (ISO, sem reordenação)
function isoDigitsToIso(digits: string): string {
  if (!digits) return ''
  const y = digits.slice(0, 4)
  const m = digits.slice(4, 6)
  const d = digits.slice(6, 8)
  if (d) return `${y}-${m}-${d}`
  if (m) return `${y}-${m}`
  return y
}

export function DateInput({ value, onChange, placeholder, className }: DateInputProps) {
  const language = useAppStore((s) => s.language)
  const fmt = getFormat(language)
  const inputRef = useRef<HTMLInputElement>(null)
  const [display, setDisplay] = useState(() => isoToDisplay(value, fmt))
  const lastEmitted = useRef<string>(value)

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const cursor = e.target.selectionStart ?? raw.length

    if (fmt === 'iso') {
      const digits = raw.replace(/\D/g, '').slice(0, 8)
      const formatted = maskIso(digits)
      const shift = formatted.length > raw.length ? 1 : 0
      const iso = isoDigitsToIso(digits)
      setDisplay(formatted)
      lastEmitted.current = iso
      onChange(iso)
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(cursor + shift, cursor + shift)
      })
    } else {
      const digits = raw.replace(/\D/g, '').slice(0, 8)
      const formatted = maskDmy(digits)
      const shift = formatted.length > raw.length ? 1 : 0
      const iso = displayDigitsToIso(digits)
      setDisplay(formatted)
      lastEmitted.current = iso
      onChange(iso)
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(cursor + shift, cursor + shift)
      })
    }
  }

  const ph = placeholder ?? (fmt === 'iso' ? 'YYYY-MM-DD' : 'DD/MM/AAAA')

  return (
    <input
      ref={inputRef}
      type="text"
      value={display}
      onChange={handleChange}
      placeholder={ph}
      maxLength={10}
      spellCheck={false}
      className={className}
    />
  )
}
