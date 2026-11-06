/**
 * Marcadores de âncora de chronicle (`^id`): ficam no fim de um parágrafo ou
 * numa linha sozinha e identificam o trecho de cada entrada.
 */

/**
 * Normaliza CRLF e tira os marcadores `^id` antes de exibir/exportar o texto.
 * Só a marca sai: as quebras de linha ficam, para um marcador numa linha
 * sozinha não juntar os parágrafos vizinhos. Um `^` no meio da linha fica.
 */
export function stripAnchors(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/[ \t]*\^[\w-]+[ \t]*$/gm, '')
}

/**
 * Extrai o bloco (parágrafo) que termina com `^anchorId`, sem a marca.
 * Normaliza CRLF antes (arquivos do Windows). Retorna null se não encontrar.
 */
export function extractBlock(body: string, anchorId: string): string | null {
  const normalized = body.replace(/\r\n/g, '\n')
  const blocks = normalized.split(/\n{2,}/)
  const re = new RegExp(`\\^${anchorId}\\s*$`)
  for (const block of blocks) {
    const stripped = block.trim()
    if (re.test(stripped)) return stripped.replace(/\s*\^\S+\s*$/, '').trim()
  }
  return null
}
