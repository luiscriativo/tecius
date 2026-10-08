/**
 * Link Markdown de uma imagem. Caminho com espaço ou parênteses (ex: capturas de
 * tela do macOS, "Captura de Tela … às 12.42.43.png") só vira imagem entre <...>;
 * o caminho fica legível e igual ao nome do arquivo (a busca de órfãos o encontra).
 */
export function imageMarkdown(alt: string, path: string): string {
  const dest = /[\s()<>]/.test(path) ? `<${path.replace(/[<>]/g, (c) => encodeURIComponent(c))}>` : path
  return `![${alt}](${dest})`
}
