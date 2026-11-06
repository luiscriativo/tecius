/**
 * Formata um valor como escalar YAML seguro para uso em templates
 * (`title: ${...}`). Valores com caracteres especiais (ex: "Guerra: início")
 * gerariam YAML inválido e o arquivo seria ignorado na leitura.
 */
export function yamlScalar(value: string): string {
  const needsQuotes =
    value === '' ||
    /[:#[\]{}&*!|>'"%@`]/.test(value) ||
    /^[\s\-?,]/.test(value) ||
    /\s$/.test(value) ||
    /[\r\n]/.test(value) ||
    /^(true|false|yes|no|on|off|null|~)$/i.test(value)
  return needsQuotes ? JSON.stringify(value) : value
}

/** Linha `chave: valor` de um cabeçalho; `null`/vazio não entra */
export function yamlLine(key: string, value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' || typeof value === 'boolean') return `${key}: ${value}`
  return `${key}: ${yamlScalar(value)}`
}

/** Lista inline `[a, b]` com cada item entre aspas quando preciso */
export function yamlList(items: string[]): string {
  return `[${items.map((t) => (t.includes(',') ? JSON.stringify(t) : yamlScalar(t))).join(', ')}]`
}
