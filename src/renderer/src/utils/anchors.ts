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
