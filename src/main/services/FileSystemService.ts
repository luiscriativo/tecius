/**
 * FileSystemService — Fase 1: Implementacao completa
 *
 * Servico singleton para todas as operacoes de sistema de arquivos do Chronicler.
 * Roda exclusivamente no main process (Node.js).
 */

import path from 'path'
import fs from 'fs'
import matter from 'gray-matter'

// Tipos compartilhados com o renderer via IPC
export interface RawEvent {
  filePath: string
  relativePath: string
  slug: string
  frontmatter: Record<string, unknown>
  hasSubtimeline: boolean
  subtimelinePath?: string
  /** Preenchido quando o evento foi expandido de um chronicle */
  chronicle?: {
    title: string
    entryIndex: number
    totalEntries: number
    anchor?: string
  }
}

export interface RawTimeline {
  dirPath: string
  relativePath: string
  meta: Record<string, unknown>
  events: RawEvent[]
  subtimelines: RawTimelineRef[]
}

export interface RawTimelineRef {
  title: string
  dirPath: string
  relativePath: string
  icon?: string
  eventCount: number
}

export interface RawVault {
  rootPath: string
  title: string
  timelines: RawTimelineRef[]
  totalEvents: number
  trashCount: number
}

export interface RawTrashItem {
  name: string
  originalPath: string
  trashedAt: string
  dirPath: string
  eventCount: number
}

export interface AssetInfo {
  filePath: string
  filename: string
  eventFolder: string
  eventFolderPath: string
  relativePath: string  // always "_assets/filename"
  size: number
  isOrphaned: boolean
}

/**
 * Converte Date objects do js-yaml para strings ISO "YYYY-MM-DD".
 * O gray-matter/js-yaml parseia `date: 1789-07-14` como JS Date automaticamente.
 * Usamos getUTC* para evitar problemas de timezone em datas historicas.
 */
function sanitizeFrontmatter(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      const y = value.getUTCFullYear()
      const m = String(value.getUTCMonth() + 1).padStart(2, '0')
      const d = String(value.getUTCDate()).padStart(2, '0')
      result[key] = `${y}-${m}-${d}`
    } else {
      result[key] = value
    }
  }
  return result
}

export class FileSystemService {
  private vaultPath: string | null = null
  private watcher: fs.FSWatcher | null = null

  setVaultPath(vaultPath: string): void {
    this.vaultPath = vaultPath
  }

  getVaultPath(): string | null {
    return this.vaultPath
  }

  /**
   * Valida que um caminho esta dentro do vault (seguranca anti path-traversal).
   */
  assertWithinVault(filePath: string): void {
    if (!this.vaultPath) throw new Error('Vault nao configurado')
    const resolved = path.resolve(filePath)
    const vault = path.resolve(this.vaultPath)
    if (!resolved.startsWith(vault + path.sep) && resolved !== vault) {
      throw new Error('Acesso negado: caminho fora do vault')
    }
  }

  /**
   * Verifica se uma pasta e uma timeline (contem _timeline.md).
   */
  isTimeline(dirPath: string): boolean {
    return fs.existsSync(path.join(dirPath, '_timeline.md'))
  }

  /**
   * Lista pastas de timeline diretas dentro de um diretorio.
   */
  listTimelineDirs(parentDir: string): string[] {
    if (!fs.existsSync(parentDir)) return []
    return fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && this.isTimeline(path.join(parentDir, e.name)))
      .map((e) => path.join(parentDir, e.name))
  }

  /**
   * Parseia o _timeline.md de uma pasta e retorna o frontmatter.
   */
  readTimelineMeta(dirPath: string): Record<string, unknown> {
    const metaPath = path.join(dirPath, '_timeline.md')
    if (!fs.existsSync(metaPath)) return {}
    try {
      const content = fs.readFileSync(metaPath, 'utf-8')
      const { data } = matter(content)
      return sanitizeFrontmatter(data as Record<string, unknown>)
    } catch {
      return {}
    }
  }

  /**
   * Conta eventos (.md exceto _timeline.md) recursivamente numa pasta.
   */
  countEvents(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0
    let count = 0
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '_timeline.md') {
          count++
        } else if (entry.isDirectory()) {
          count += this.countEvents(path.join(dirPath, entry.name))
        }
      }
    } catch {
      // silently ignore unreadable dirs
    }
    return count
  }

  /**
   * Le o vault completo: retorna arvore de timelines de nivel 1.
   */
  readVault(): RawVault {
    if (!this.vaultPath) throw new Error('Vault nao configurado')
    const vaultPath = this.vaultPath

    const timelineDirs = this.listTimelineDirs(vaultPath)

    const timelines: RawTimelineRef[] = timelineDirs.map((dirPath) => {
      const meta = this.readTimelineMeta(dirPath)
      const title = meta.title ? String(meta.title) : path.basename(dirPath)
      const icon = meta.icon ? String(meta.icon) : undefined
      const relativePath = path.relative(vaultPath, dirPath)
      const eventCount = this.countEvents(dirPath)

      return { title, dirPath, relativePath, icon, eventCount }
    })

    const totalEvents = timelines.reduce((sum, t) => sum + t.eventCount, 0)

    // Tenta ler titulo do vault de um eventual _vault.md na raiz
    let vaultTitle = 'Meu Vault'
    const vaultMetaPath = path.join(vaultPath, '_vault.md')
    if (fs.existsSync(vaultMetaPath)) {
      try {
        const { data } = matter(fs.readFileSync(vaultMetaPath, 'utf-8'))
        if (data.title) vaultTitle = String(data.title)
      } catch {
        // ignore
      }
    }

    // Conta itens na lixeira interna do vault
    const trashDir = path.join(vaultPath, '.trash')
    const trashCount = fs.existsSync(trashDir)
      ? fs.readdirSync(trashDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
      : 0

    return {
      rootPath: vaultPath,
      title: vaultTitle,
      timelines,
      totalEvents,
      trashCount,
    }
  }

  /**
   * Le uma timeline: parseia todos os .md de uma pasta, retorna eventos ordenados.
   */
  readTimeline(timelinePath: string): RawTimeline {
    if (!this.vaultPath) throw new Error('Vault nao configurado')
    const vaultPath = this.vaultPath

    const meta = this.readTimelineMeta(timelinePath)
    const relativePath = path.relative(vaultPath, timelinePath)

    // Lista todos os arquivos .md na pasta (nao recursivo)
    const entries = fs.existsSync(timelinePath)
      ? fs.readdirSync(timelinePath, { withFileTypes: true })
      : []

    const events: RawEvent[] = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.md')) continue
      if (entry.name === '_timeline.md') continue

      const filePath = path.join(timelinePath, entry.name)
      const slug = path.basename(entry.name, '.md')

      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const { data: frontmatter } = matter(content)
        const sanitized = sanitizeFrontmatter(frontmatter as Record<string, unknown>)

        // ── Chronicle: um .md com várias datas → vários eventos ──────────────
        if (String(sanitized.type ?? '') === 'chronicle') {
          const chronicleTitle = String(sanitized.title ?? slug)
          // Suporta ambos os formatos: "entries:" (novo) e "events:" (legado)
          const rawEntries = Array.isArray(sanitized.entries)
            ? sanitized.entries as unknown[]
            : Array.isArray(sanitized.events)
              ? sanitized.events as unknown[]
              : []

          rawEntries.forEach((raw, i) => {
            if (!raw || typeof raw !== 'object') return
            const entry = raw as Record<string, unknown>
            if (!entry.date) return

            // Converte Date do yaml para string (sanitizeFrontmatter não desce em arrays)
            let dateStr: string
            if (entry.date instanceof Date) {
              const d = entry.date as Date
              dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            } else {
              dateStr = String(entry.date)
            }

            events.push({
              filePath,
              relativePath: path.relative(vaultPath, filePath),
              slug: `${slug}__chr${i}`,
              frontmatter: {
                type: 'event',
                title: String(entry.title ?? entry.label ?? `Evento ${i + 1}`),
                date: dateStr,
                category: entry.category ?? sanitized.category,
                importance: entry.importance ?? sanitized.importance ?? 3,
                tags: Array.isArray(entry.tags) ? entry.tags
                  : Array.isArray(sanitized.tags) ? sanitized.tags
                  : undefined,
              },
              hasSubtimeline: false,
              subtimelinePath: undefined,
              chronicle: {
                title: chronicleTitle,
                entryIndex: i,
                totalEntries: rawEntries.length,
                anchor: entry.anchor ? String(entry.anchor) : undefined,
              },
            })
          })
          continue // pula o push normal abaixo
        }

        // ── Evento padrão ─────────────────────────────────────────────────────
        const subDir = path.join(timelinePath, slug)
        const hasSubtimeline = this.isTimeline(subDir)
        const subtimelinePath = hasSubtimeline ? subDir : undefined

        events.push({
          filePath,
          relativePath: path.relative(vaultPath, filePath),
          slug,
          frontmatter: sanitized,
          hasSubtimeline,
          subtimelinePath,
        })
      } catch {
        // silently skip unreadable files
      }
    }

    // Ordena por data do frontmatter (string sort funciona com YYYY-MM-DD)
    events.sort((a, b) => {
      const dateA = String(a.frontmatter.date ?? '0')
      const dateB = String(b.frontmatter.date ?? '0')
      return dateA.localeCompare(dateB)
    })

    // Lista sub-timelines diretas (subpastas com _timeline.md)
    const subtimelineDirs = this.listTimelineDirs(timelinePath)
    const subtimelines: RawTimelineRef[] = subtimelineDirs.map((dirPath) => {
      const subMeta = this.readTimelineMeta(dirPath)
      const title = subMeta.title ? String(subMeta.title) : path.basename(dirPath)
      const icon = subMeta.icon ? String(subMeta.icon) : undefined
      const subRelativePath = path.relative(vaultPath, dirPath)
      const eventCount = this.countEvents(dirPath)
      return { title, dirPath, relativePath: subRelativePath, icon, eventCount }
    })

    return {
      dirPath: timelinePath,
      relativePath,
      meta,
      events,
      subtimelines,
    }
  }

  /**
   * Le um evento especifico: retorna frontmatter + corpo completo do markdown.
   */
  readEvent(eventPath: string): { frontmatter: Record<string, unknown>; body: string; filePath: string; raw: string } {
    const content = fs.readFileSync(eventPath, 'utf-8')
    const { data, content: body } = matter(content)
    return {
      frontmatter: sanitizeFrontmatter(data as Record<string, unknown>),
      body: body.trim(),
      filePath: eventPath,
      raw: content,
    }
  }

  /**
   * Escreve o conteúdo bruto (frontmatter + body) de volta ao arquivo.
   */
  writeEvent(filePath: string, rawContent: string): void {
    this.assertWithinVault(filePath)
    fs.writeFileSync(filePath, rawContent, 'utf-8')
  }

  /**
   * Salva um buffer de imagem na pasta _assets/ dentro do diretório do evento.
   * Retorna o caminho relativo para usar no markdown.
   */
  saveImage(
    buffer: Buffer,
    filename: string,
    eventFilePath: string,
  ): { relativePath: string; absolutePath: string } {
    this.assertWithinVault(eventFilePath)
    const dir = path.dirname(eventFilePath)
    const assetsDir = path.join(dir, '_assets')
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
    const ext = path.extname(filename) || '.png'
    const base = path.basename(filename, ext)
    const uniqueName = `${base}-${Date.now()}${ext}`
    const destPath = path.join(assetsDir, uniqueName)
    fs.writeFileSync(destPath, buffer)
    return { relativePath: `_assets/${uniqueName}`, absolutePath: destPath }
  }

  /**
   * Copia uma imagem do caminho de origem para _assets/.
   */
  saveImageFromPath(
    sourcePath: string,
    eventFilePath: string,
  ): { relativePath: string; absolutePath: string } {
    this.assertWithinVault(eventFilePath)
    const dir = path.dirname(eventFilePath)
    const assetsDir = path.join(dir, '_assets')
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true })
    const ext = path.extname(sourcePath)
    const base = path.basename(sourcePath, ext)
    const uniqueName = `${base}-${Date.now()}${ext}`
    const destPath = path.join(assetsDir, uniqueName)
    fs.copyFileSync(sourcePath, destPath)
    return { relativePath: `_assets/${uniqueName}`, absolutePath: destPath }
  }

  /**
   * Lista todas as imagens em pastas _assets/ dentro do vault.
   * Detecta imagens órfãs (não referenciadas em nenhum .md do mesmo diretório).
   */
  listAssets(): AssetInfo[] {
    if (!this.vaultPath) return []
    const results: AssetInfo[] = []
    this._walkForAssets(this.vaultPath, results)
    return results.sort((a, b) => a.eventFolder.localeCompare(b.eventFolder))
  }

  private _walkForAssets(dir: string, results: AssetInfo[]): void {
    if (!fs.existsSync(dir)) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const subDir = path.join(dir, entry.name)
      if (entry.name === '_assets') {
        this._collectAssets(subDir, dir, results)
      } else {
        this._walkForAssets(subDir, results)
      }
    }
  }

  private _collectAssets(assetsDir: string, eventDir: string, results: AssetInfo[]): void {
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(assetsDir, { withFileTypes: true })
    } catch {
      return
    }

    // Lê todos os .md do eventDir para detectar órfãos
    const mdContents: string[] = []
    try {
      const mdFiles = fs.readdirSync(eventDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
      for (const mdFile of mdFiles) {
        try {
          mdContents.push(fs.readFileSync(path.join(eventDir, mdFile.name), 'utf-8'))
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) continue
      const filePath = path.join(assetsDir, entry.name)
      let size = 0
      try { size = fs.statSync(filePath).size } catch { /* skip */ }
      const relativePath = `_assets/${entry.name}`
      const isOrphaned = !mdContents.some((c) => c.includes(relativePath))
      results.push({
        filePath,
        filename: entry.name,
        eventFolder: path.basename(eventDir),
        eventFolderPath: eventDir,
        relativePath,
        size,
        isOrphaned,
      })
    }
  }

  /**
   * Deleta um arquivo de imagem do vault.
   */
  deleteAsset(filePath: string): void {
    this.assertWithinVault(filePath)
    fs.unlinkSync(filePath)
  }

  /**
   * Renomeia um arquivo de imagem dentro de _assets/.
   * Se o novo nome já existir, adiciona sufixo numérico (-1, -2, …) até achar um livre.
   * Preserva a extensão original se o usuário não informar uma.
   * Retorna o nome e caminho final usados.
   */
  renameAsset(filePath: string, newName: string): { newFilePath: string; newFilename: string } {
    this.assertWithinVault(filePath)
    const dir = path.dirname(filePath)

    // Sanitiza: remove caracteres inválidos em nomes de arquivo
    let sanitized = newName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    if (!sanitized) throw new Error('Nome inválido')

    // Preserva extensão original se o usuário não incluir nenhuma
    const origExt = path.extname(filePath)
    if (!path.extname(sanitized)) {
      sanitized = sanitized + origExt
    }

    // Sem mudança — retorna direto
    if (sanitized === path.basename(filePath)) {
      return { newFilePath: filePath, newFilename: sanitized }
    }

    // Resolve conflito com sufixo numérico
    let finalName = sanitized
    let counter = 1
    while (fs.existsSync(path.join(dir, finalName))) {
      const ext = path.extname(sanitized)
      const base = path.basename(sanitized, ext)
      finalName = `${base}-${counter}${ext}`
      counter++
    }

    const newFilePath = path.join(dir, finalName)
    fs.renameSync(filePath, newFilePath)
    return { newFilePath, newFilename: finalName }
  }

  /**
   * Move uma timeline para a lixeira interna do vault (.trash/).
   * Grava _trash_meta.json dentro da pasta movida para permitir restauração.
   */
  moveTimelineToVaultTrash(dirPath: string): void {
    this.assertWithinVault(dirPath)
    const trashDir = path.join(this.vaultPath!, '.trash')
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir)

    const baseName = path.basename(dirPath)
    let destName = baseName
    let destPath = path.join(trashDir, destName)
    if (fs.existsSync(destPath)) {
      let i = 2
      while (fs.existsSync(path.join(trashDir, `${baseName}-${i}`))) i++
      destName = `${baseName}-${i}`
      destPath = path.join(trashDir, destName)
    }

    // Lê o título original antes de mover
    const originalTitle = String(this.readTimelineMeta(dirPath).title ?? baseName)

    fs.renameSync(dirPath, destPath)

    // Grava metadados dentro da pasta para restauração
    const meta = {
      originalName: originalTitle,
      originalPath: dirPath,
      trashedAt: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(destPath, '_trash_meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
  }

  /**
   * Lista todos os itens na lixeira interna (.trash/).
   */
  listTrash(): RawTrashItem[] {
    if (!this.vaultPath) return []
    const trashDir = path.join(this.vaultPath, '.trash')
    if (!fs.existsSync(trashDir)) return []

    const items: RawTrashItem[] = []
    const entries = fs.readdirSync(trashDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dirPath = path.join(trashDir, entry.name)
      const metaPath = path.join(dirPath, '_trash_meta.json')

      let name = entry.name
      let originalPath = path.join(this.vaultPath, entry.name)
      let trashedAt = new Date().toISOString()

      if (fs.existsSync(metaPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
          if (raw.originalName) name = raw.originalName
          if (raw.originalPath) originalPath = raw.originalPath
          if (raw.trashedAt) trashedAt = raw.trashedAt
        } catch { /* ignora erros de parse */ }
      }

      items.push({ name, originalPath, trashedAt, dirPath, eventCount: this.countEvents(dirPath) })
    }

    // Mais recente primeiro
    return items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt))
  }

  /**
   * Restaura um item da lixeira para o seu local original (ou vault root se ocupado).
   */
  restoreFromTrash(trashItemPath: string): void {
    this.assertWithinVault(trashItemPath)
    const metaPath = path.join(trashItemPath, '_trash_meta.json')
    let isEventItem = false
    let originalPath: string | undefined

    if (fs.existsSync(metaPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        if (raw.type === 'event') isEventItem = true
        if (raw.originalPath) originalPath = raw.originalPath
        fs.unlinkSync(metaPath) // Remove metadata before restoring
      } catch { /* ignore */ }
    }

    if (isEventItem && originalPath) {
      // Find the .md file inside the wrapper folder
      let mdFile: string | null = null
      try {
        const entries = fs.readdirSync(trashItemPath, { withFileTypes: true })
        const md = entries.find((e) => e.isFile() && e.name.endsWith('.md'))
        if (md) mdFile = path.join(trashItemPath, md.name)
      } catch { /* ignore */ }

      if (mdFile) {
        let destPath = originalPath
        // Resolve collision
        if (fs.existsSync(destPath)) {
          const dir = path.dirname(destPath)
          const base = path.basename(destPath, '.md')
          let i = 2
          while (fs.existsSync(path.join(dir, `${base}-${i}.md`))) i++
          destPath = path.join(dir, `${base}-${i}.md`)
        }
        fs.renameSync(mdFile, destPath)
      }
      // Delete the wrapper folder
      fs.rmSync(trashItemPath, { recursive: true, force: true })
      return
    }

    // Original timeline folder restore
    let destPath = originalPath ?? path.join(this.vaultPath!, path.basename(trashItemPath))

    // Resolve collision on destination
    if (fs.existsSync(destPath)) {
      const base = path.basename(destPath)
      const parent = path.dirname(destPath)
      let i = 2
      while (fs.existsSync(path.join(parent, `${base}-${i}`))) i++
      destPath = path.join(parent, `${base}-${i}`)
    }

    fs.renameSync(trashItemPath, destPath)
  }

  /**
   * Exclui permanentemente um item da lixeira.
   */
  deleteFromTrash(trashItemPath: string): void {
    this.assertWithinVault(trashItemPath)
    fs.rmSync(trashItemPath, { recursive: true, force: true })
  }

  /**
   * Esvazia toda a lixeira interna do vault.
   */
  emptyTrash(): void {
    if (!this.vaultPath) return
    const trashDir = path.join(this.vaultPath, '.trash')
    if (fs.existsSync(trashDir)) {
      fs.rmSync(trashDir, { recursive: true, force: true })
      fs.mkdirSync(trashDir)
    }
  }

  /**
   * Cria uma nova timeline (pasta + _timeline.md) dentro de parentDir.
   * Gera um slug único a partir do nome; resolve colisões com sufixo numérico.
   */
  createTimeline(name: string, parentDir: string): void {
    this.assertWithinVault(parentDir)
    const slug = (
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') || 'nova-timeline'
    )
    let dirPath = path.join(parentDir, slug)
    if (fs.existsSync(dirPath)) {
      let i = 2
      while (fs.existsSync(path.join(parentDir, `${slug}-${i}`))) i++
      dirPath = path.join(parentDir, `${slug}-${i}`)
    }
    fs.mkdirSync(dirPath, { recursive: true })
    fs.writeFileSync(path.join(dirPath, '_timeline.md'), `---\ntitle: ${name}\n---\n`, 'utf-8')
  }

  /**
   * Atualiza o título de uma timeline no seu _timeline.md sem renomear a pasta.
   */
  renameTimeline(dirPath: string, newTitle: string): void {
    this.assertWithinVault(dirPath)
    const metaPath = path.join(dirPath, '_timeline.md')
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, `---\ntitle: ${newTitle}\n---\n`, 'utf-8')
      return
    }
    const raw = fs.readFileSync(metaPath, 'utf-8')
    const { data, content: body } = matter(raw)
    data.title = newTitle
    fs.writeFileSync(metaPath, matter.stringify(body, data), 'utf-8')
  }

  /**
   * Renomeia o vault: escreve/atualiza o titulo em _vault.md na raiz.
   */
  renameVault(newTitle: string): void {
    if (!this.vaultPath) throw new Error('Vault não configurado')
    const metaPath = path.join(this.vaultPath, '_vault.md')
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, `---\ntitle: ${newTitle}\n---\n`, 'utf-8')
      return
    }
    const raw = fs.readFileSync(metaPath, 'utf-8')
    const { data, content: body } = matter(raw)
    data.title = newTitle
    fs.writeFileSync(metaPath, matter.stringify(body, data), 'utf-8')
  }

  /**
   * Exclui permanentemente uma timeline e todos os seus arquivos.
   */
  deleteTimelinePermanently(dirPath: string): void {
    this.assertWithinVault(dirPath)
    fs.rmSync(dirPath, { recursive: true, force: true })
  }

  createEvent(timelineDirPath: string, title: string, filename?: string, date?: string): { filePath: string; slug: string } {
    this.assertWithinVault(timelineDirPath)
    const base = (filename || title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'novo-evento'

    let slug = base
    let filePath = path.join(timelineDirPath, `${slug}.md`)
    if (fs.existsSync(filePath)) {
      let i = 2
      while (fs.existsSync(path.join(timelineDirPath, `${base}-${i}.md`))) i++
      slug = `${base}-${i}`
      filePath = path.join(timelineDirPath, `${slug}.md`)
    }

    // Usa a data fornecida pelo usuário; cai para hoje se não informada ou inválida.
    // Aceita os mesmos formatos que parseChroniclerDate: "1789", "1789-07", "1789-07-14"
    const dateStr = date && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(date.trim())
      ? date.trim()
      : (() => {
          const today = new Date()
          return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        })()

    const template = `---\ntitle: ${title}\ndate: ${dateStr}\nimportance: 3\n---\n\n`
    fs.writeFileSync(filePath, template, 'utf-8')
    return { filePath, slug }
  }

  moveEventToVaultTrash(eventFilePath: string): void {
    this.assertWithinVault(eventFilePath)
    const trashDir = path.join(this.vaultPath!, '.trash')
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir)

    const slug = path.basename(eventFilePath, '.md')
    let wrapperName = `__event__${slug}`
    let wrapperPath = path.join(trashDir, wrapperName)
    if (fs.existsSync(wrapperPath)) {
      let i = 2
      while (fs.existsSync(path.join(trashDir, `${wrapperName}-${i}`))) i++
      wrapperName = `${wrapperName}-${i}`
      wrapperPath = path.join(trashDir, wrapperName)
    }

    fs.mkdirSync(wrapperPath)

    // Try to read the event title for better display in TrashView
    let displayName = slug
    try {
      const content = fs.readFileSync(eventFilePath, 'utf-8')
      const { data } = matter(content)
      if (data.title) displayName = String(data.title)
    } catch { /* use slug */ }

    const meta = {
      type: 'event',
      originalName: displayName,
      originalPath: eventFilePath,
      trashedAt: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(wrapperPath, '_trash_meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
    fs.renameSync(eventFilePath, path.join(wrapperPath, path.basename(eventFilePath)))
  }

  renameEventFile(eventFilePath: string, newFilename: string): { newFilePath: string; newSlug: string } {
    this.assertWithinVault(eventFilePath)
    const dir = path.dirname(eventFilePath)

    let sanitized = newFilename.trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\.md$/i, '')
    if (!sanitized) throw new Error('Nome inválido')

    const newFilePath = path.join(dir, `${sanitized}.md`)
    if (newFilePath === eventFilePath) {
      return { newFilePath: eventFilePath, newSlug: sanitized }
    }
    if (fs.existsSync(newFilePath)) {
      throw new Error(`Já existe um evento com o nome "${sanitized}.md"`)
    }
    fs.renameSync(eventFilePath, newFilePath)
    return { newFilePath, newSlug: sanitized }
  }

  /**
   * Inicia fs.watch no vault e chama callback quando algo muda.
   */
  startWatcher(callback: (eventPath: string) => void): void {
    if (!this.vaultPath) return
    this.stopWatcher()
    this.watcher = fs.watch(this.vaultPath, { recursive: true }, (_event, filename) => {
      if (filename) {
        callback(filename)
      }
    })
  }

  /**
   * Para o watcher.
   */
  stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}

// Instancia singleton
export const fileSystemService = new FileSystemService()
