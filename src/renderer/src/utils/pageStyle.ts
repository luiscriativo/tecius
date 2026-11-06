/**
 * Estilos de página: como a página de um evento (e o cabeçalho da timeline) é
 * desenhada. O estilo é uma propriedade do arquivo, herdada do vault
 * (`_vault.md`) para a timeline (`_timeline.md`) e para o evento; o Markdown
 * não muda, só a forma.
 *
 *   classico — o estilo do app (padrão)
 *   jornal   — jornal vitoriano: gótica no cabeçalho, filetes, manchete, colunas
 *   (e os presets pg: campo, dossie, iluminura, cartaz, correio, rosto, verbete, gazeta, diario, decreto, revista)
 *   <nome>   — estilo próprio: `_styles/<nome>.css` no vault
 */

export const PAGE_PRESETS = ['classico', 'jornal', 'album', 'campo', 'dossie', 'iluminura', 'cartaz', 'correio', 'rosto', 'verbete', 'gazeta', 'diario', 'decreto', 'revista'] as const
/** Presets desenhados sobre a estrutura comum `pg-*` (StyledPage + page.css) */
export const STYLED_PRESETS = ['campo', 'dossie', 'iluminura', 'cartaz', 'correio', 'rosto', 'verbete', 'gazeta', 'diario', 'decreto', 'revista'] as const
export const isStyledPreset = (s: string): boolean => (STYLED_PRESETS as readonly string[]).includes(s)
/** Colunas do texto por padrão em cada preset (o frontmatter `columns` sobrepõe) */
export const presetColumns = (preset: string): 1 | 2 | 3 => (preset === 'revista' ? 3 : preset === 'jornal' || preset === 'cartaz' || preset === 'verbete' ? 2 : 1)
export type PagePreset = (typeof PAGE_PRESETS)[number]

/** Nome normalizado de um estilo (minúsculas, sem acentos, só a-z 0-9 - _) */
export function normalizeStyleName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]/g, '')
  if (!s) return null
  // Sinônimos
  if (s === 'classic' || s === 'default' || s === 'padrao') return 'classico'
  if (s === 'journal' || s === 'newspaper' || s === 'jornal') return 'jornal'
  if (s === 'scrapbook' || s === 'photo-album' || s === 'album') return 'album'
  if (s === 'field' || s === 'field-notebook' || s === 'fieldnotebook' || s === 'caderno' || s === 'caderno-de-campo' || s === 'notebook') return 'campo'
  if (s === 'dossier' || s === 'dossie' || s === 'arquivo' || s === 'typewriter' || s === 'file') return 'dossie'
  if (s === 'illuminated' || s === 'manuscript' || s === 'manuscrito' || s === 'iluminura' || s === 'medieval') return 'iluminura'
  if (s === 'poster' || s === 'broadside' || s === 'cartaz' || s === 'letterpress') return 'cartaz'
  if (s === 'airmail' || s === 'mail' || s === 'carta' || s === 'correio' || s === 'letter' || s === 'postal') return 'correio'
  if (s === 'titlepage' || s === 'title-page' || s === 'folha-de-rosto' || s === 'folhaderosto' || s === 'rosto' || s === 'livro' || s === 'book') return 'rosto'
  if (s === 'encyclopedia' || s === 'enciclopedia' || s === 'verbete' || s === 'entry') return 'verbete'
  if (s === 'gazette' || s === 'gazeta') return 'gazeta'
  if (s === 'diary' || s === 'diario' || s === 'journal-intime') return 'diario'
  if (s === 'decree' || s === 'decreto' || s === 'alvara' || s === 'edital' || s === 'ata') return 'decreto'
  if (s === 'magazine' || s === 'revista' || s === 'mag') return 'revista'
  return s
}

/** Primeiro estilo definido, do mais específico (evento) ao mais geral (vault) */
export function resolvePageStyle(...levels: unknown[]): string {
  for (const l of levels) {
    const s = normalizeStyleName(l)
    if (s) return s
  }
  return 'classico'
}

export const isPreset = (s: string): s is PagePreset => (PAGE_PRESETS as readonly string[]).includes(s)

/** Estrelas da importância (1–5) para o rodapé do jornal */
export function importanceStars(n: number | undefined): string {
  const v = Math.max(0, Math.min(5, Math.round(n ?? 0)))
  return '★'.repeat(v) + '☆'.repeat(5 - v)
}

/** Papel da página (`paper:` no arquivo): claro ou escuro, independente do tema do app */
export function normalizeTone(v: unknown): 'light' | 'dark' | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim().toLowerCase()
  if (t === 'light' || t === 'claro' || t === 'clara') return 'light'
  if (t === 'dark' || t === 'escuro' || t === 'escura') return 'dark'
  return undefined
}

/** Coordenadas em graus e minutos: 23°32′S 46°38′O */
export function formatCoords(lat: number, lng: number): string {
  const dm = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v)
    const d = Math.floor(a)
    const m = Math.round((a - d) * 60)
    return `${m === 60 ? d + 1 : d}°${String(m === 60 ? 0 : m).padStart(2, '0')}′${v < 0 ? neg : pos}`
  }
  return `${dm(lat, 'N', 'S')} ${dm(lng, 'L', 'O')}`
}

/** Colunas do texto (1–3), do frontmatter da timeline ou do evento */
export function columnsOf(v: unknown, fallback = 2): 1 | 2 | 3 {
  const n = Number(v)
  return n === 1 || n === 2 || n === 3 ? n : fallback as 1 | 2 | 3
}
