/**
 * Preferências de tela (filtros, modos, toggles) guardadas no localStorage, para
 * o app reabrir cada tela como o usuário deixou. Só conveniência: se o storage
 * falhar ou tiver um valor inválido/antigo, vale o padrão.
 */

const PREFIX = 'tecius:pref:'

export function readPref<T>(key: string, fallback: T, isValid?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const v: unknown = JSON.parse(raw)
    if (isValid ? isValid(v) : typeof v === typeof fallback) return v as T
  } catch { /* storage indisponível ou JSON inválido */ }
  return fallback
}

export function writePref<T>(key: string, value: T): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* ignora */ }
}

/**
 * Validador para preferências que são uma lista fechada de valores. Recebe a
 * lista (não `...valores`): o ofuscador do build protegido perde argumentos
 * espalhados em chamadas como `f(...lista)`.
 */
export const oneOf = <T extends string | number>(values: readonly T[]) =>
  (v: unknown): v is T => values.includes(v as T)
