/**
 * App IPC Handlers
 *
 * Handles application-level IPC calls from the renderer process.
 * These are invoked via window.electronAPI.invoke('app:*').
 */

import { ipcMain, app, nativeTheme, shell, BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getMainLanguage, setMainLanguage, tm } from '../i18n'

export function registerAppHandlers(): void {
  // ── app:set-language ───────────────────────────────────────────────────────
  // Idioma da interface (diálogos nativos e mensagens de erro do processo principal)
  ipcMain.handle('app:set-language', (_event, language: unknown) => {
    setMainLanguage(language)
  })

  // ── app:get-version ────────────────────────────────────────────────────────
  // Returns the current application version from package.json.
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  // ── app:get-platform ───────────────────────────────────────────────────────
  // Returns the OS platform: 'darwin' | 'win32' | 'linux'.
  ipcMain.handle('app:get-platform', () => {
    return process.platform
  })

  // ── app:get-theme ──────────────────────────────────────────────────────────
  // Returns the current native OS theme preference.
  ipcMain.handle('app:get-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  // ── app:open-external ─────────────────────────────────────────────────────
  // Safely opens a URL in the system's default browser.
  // Validates the URL to prevent abuse (only http/https allowed).
  ipcMain.handle('app:open-external', async (_event, url: string) => {
    if (typeof url !== 'string') return { success: false, error: 'Invalid URL' }

    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http and https URLs are allowed' }
      }
      await shell.openExternal(url)
      return { success: true }
    } catch {
      return { success: false, error: 'Invalid URL format' }
    }
  })

  // ── app:quit ──────────────────────────────────────────────────────────────
  // Gracefully quits the application.
  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // ── app:export-pdf ────────────────────────────────────────────────────────
  // Renders markdown HTML in a hidden BrowserWindow and exports it as PDF.
  // The renderer sends pre-rendered HTML content; this handler wraps it in
  // an Obsidian-inspired template and prints it cleanly to a PDF file.
  ipcMain.handle('app:export-pdf', async (event, options: {
    suggestedName: string
    htmlContent: string
    title: string
    dateDisplay: string
    tags: string[]
    pageSize: string
    landscape: boolean
    marginType: 'default' | 'none' | 'printableArea'
    scaleFactor: number
    includeTags: boolean
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window found' }

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: tm('dialog_export_pdf'),
      defaultPath: `${safeFileName(options.suggestedName, 'evento')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    const html = buildPdfHtml(options)
    const tmpFile = join(tmpdir(), `tecius-pdf-${Date.now()}.html`)
    const printWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: { javascript: false },
    })

    try {
      await fs.writeFile(tmpFile, html, 'utf-8')
      await printWindow.loadFile(tmpFile)
      // Allow asset:// images to finish loading before capturing
      await new Promise<void>((resolve) => setTimeout(resolve, 400))
      const data = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: options.pageSize as Electron.PrintToPDFOptions['pageSize'],
        landscape: options.landscape,
        scale: options.scaleFactor / 100,
      })
      await fs.writeFile(filePath, data)
      return { success: true, filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    } finally {
      printWindow.destroy()
      await fs.unlink(tmpFile).catch(() => {})
    }
  })
}

// ── Exportar timeline inteira (PDF ou página web) ──────────────────────────────

/** asset://local/<caminho> → caminho no disco */
function assetUrlToPath(url: string): string {
  const parts = url.replace(/^asset:\/\/local\//, '').split('/').map((p) => { try { return decodeURIComponent(p) } catch { return p } })
  return /^[A-Za-z]:$/.test(parts[0] ?? '') ? parts.join('/') : '/' + parts.join('/')
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
}

/** Troca imagens asset:// por dados embutidos: o arquivo fica autossuficiente */
async function inlineAssets(html: string): Promise<string> {
  const urls = [...new Set([...html.matchAll(/src="(asset:\/\/local\/[^"]+)"/g)].map((m) => m[1]))]
  let out = html
  for (const url of urls) {
    try {
      const file = assetUrlToPath(url.replace(/&amp;/g, '&'))
      const ext = file.split('.').pop()?.toLowerCase() ?? ''
      const data = await fs.readFile(file)
      out = out.split(`src="${url}"`).join(`src="data:${MIME[ext] ?? 'application/octet-stream'};base64,${data.toString('base64')}"`)
    } catch { /* imagem ausente: fica o link original */ }
  }
  return out
}

export function registerTimelineExport(): void {
  ipcMain.handle('app:export-timeline', async (event, options: {
    format: 'pdf' | 'html'
    suggestedName: string
    title: string
    bodyHtml: string
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window found' }
    const isPdf = options.format === 'pdf'
    const baseName = safeFileName(options.suggestedName, 'timeline')
    // Testes automatizados não operam o diálogo nativo: TECIUS_TEST_SAVE_DIR fornece a pasta
    const testDir = process.env.TECIUS_TEST_SAVE_DIR
    const { canceled, filePath } = testDir
      ? { canceled: false, filePath: join(testDir, `${baseName}.${isPdf ? 'pdf' : 'html'}`) }
      : await dialog.showSaveDialog(win, {
      title: tm(isPdf ? 'dialog_export_pdf' : 'dialog_export_html'),
      defaultPath: `${baseName}.${isPdf ? 'pdf' : 'html'}`,
      filters: [isPdf ? { name: 'PDF', extensions: ['pdf'] } : { name: 'HTML', extensions: ['html'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    const html = await inlineAssets(buildTimelineHtml(options.title, options.bodyHtml, !isPdf))
    if (!isPdf) {
      await fs.writeFile(filePath, html, 'utf-8')
      return { success: true, filePath }
    }
    const tmpFile = join(tmpdir(), `tecius-timeline-${Date.now()}.html`)
    const printWindow = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { javascript: false } })
    try {
      await fs.writeFile(tmpFile, html, 'utf-8')
      await printWindow.loadFile(tmpFile)
      await new Promise<void>((resolve) => setTimeout(resolve, 400))
      const data = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      await fs.writeFile(filePath, data)
      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      printWindow.destroy()
      await fs.unlink(tmpFile).catch(() => {})
    }
  })
}

/** Título → nome de arquivo: "/", ":" etc. criariam pastas ou nomes inválidos no diálogo de salvar */
function safeFileName(name: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex -- caracteres de controle também são proibidos em nomes de arquivo
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim() || fallback
}

/** Documento da timeline: capa, índice e um capítulo por evento */
function buildTimelineHtml(title: string, bodyHtml: string, forScreen: boolean): string {
  return `<!DOCTYPE html>
<html lang="${getMainLanguage()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.7; color: #1a1a1a; background: #fff; }
  .doc { max-width: 720px; margin: 0 auto; padding: 56px 40px; }
  .mono { font-family: 'Courier New', monospace; }
  .cover { padding-bottom: 28px; margin-bottom: 28px; border-bottom: 2px solid #1a1a1a; }
  .cover h1 { font-size: 2.4rem; line-height: 1.15; margin: 0 0 10px; }
  .cover .desc { color: #444; margin: 0 0 12px; }
  .cover .meta { font-size: 0.75rem; color: #777; letter-spacing: 0.06em; text-transform: uppercase; }
  .toc { margin: 0 0 36px; padding: 0; list-style: none; columns: 2; column-gap: 32px; font-size: 0.85rem; }
  .toc li { break-inside: avoid; padding: 2px 0; }
  .toc a { color: #1a1a1a; text-decoration: none; }
  .toc .d { font-family: 'Courier New', monospace; font-size: 0.72rem; color: #8a6a2a; margin-right: 6px; }
  article { padding: 26px 0; border-top: 1px solid #e3e3e3; }
  article .date, article h2, article h3 { break-after: avoid; }
  .body img, .chips { break-inside: avoid; }
  article .date { font-family: 'Courier New', monospace; font-size: 0.75rem; color: #8a6a2a; letter-spacing: 0.06em; text-transform: uppercase; }
  article h2 { font-size: 1.5rem; line-height: 1.25; margin: 4px 0 8px; }
  article h3 { font-size: 1.1rem; margin: 18px 0 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .chip { font-family: 'Courier New', monospace; font-size: 0.68rem; padding: 1px 7px; border: 1px solid #ccc; border-radius: 3px; color: #555; background: #f7f7f7; }
  .loc { font-family: 'Courier New', monospace; font-size: 0.75rem; color: #555; margin-bottom: 8px; }
  .entries { margin: 0 0 12px; padding-left: 18px; font-size: 0.9rem; }
  .body img { max-width: 100%; height: auto; border-radius: 3px; }
  .body blockquote { margin: 12px 0; padding: 4px 14px; border-left: 3px solid #ddd; color: #555; }
  .body pre, .body code { font-family: 'Courier New', monospace; font-size: 0.85em; background: #f5f5f5; }
  .body table { border-collapse: collapse; } .body td, .body th { border: 1px solid #ddd; padding: 4px 8px; }
  .muted { color: #999; font-style: italic; }
  footer { margin-top: 40px; font-size: 0.7rem; color: #999; font-family: 'Courier New', monospace; }
  ${forScreen ? '@media (prefers-color-scheme: dark) { body { background: #141414; color: #e8e6e1; } .cover { border-color: #e8e6e1; } .toc a { color: #e8e6e1; } article { border-color: #333; } .chip { background: #1f1f1f; border-color: #3a3a3a; color: #bbb; } .cover .desc, .loc, .body blockquote { color: #aaa; } }' : ''}
</style>
</head>
<body><div class="doc">${bodyHtml}<footer>Tecius</footer></div></body>
</html>`
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPdfHtml(options: {
  htmlContent: string
  title: string
  dateDisplay: string
  tags: string[]
}): string {
  const tagsHtml = options.tags.length > 0
    ? `<div class="tags">${options.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="${getMainLanguage()}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(options.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html { font-size: 16px; }

    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 1rem;
      line-height: 1.75;
      color: #1a1a1a;
      background: #ffffff;
    }

    .document {
      max-width: 680px;
      margin: 0 auto;
      padding: 60px 40px;
    }

    /* ── Header ─────────────────────────────────────── */
    .doc-header {
      margin-bottom: 24px;
      padding-bottom: 14px;
      border-bottom: 1px solid #e0e0e0;
    }

    .doc-title {
      font-family: Georgia, serif;
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.25;
      color: #111111;
      margin-bottom: 10px;
    }

    .doc-date {
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      color: #888888;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .tags { display: flex; flex-wrap: wrap; gap: 6px; }

    .tag {
      font-family: 'Courier New', monospace;
      font-size: 0.68rem;
      padding: 2px 8px;
      border: 1px solid #cccccc;
      border-radius: 3px;
      color: #666666;
      background: #f7f7f7;
    }

    /* ── Content typography ──────────────────────────── */
    .content h1 { font-size: 1.7rem; font-weight: 700; margin: 1.8em 0 0.5em; color: #111; line-height: 1.3; }
    .content h2 { font-size: 1.35rem; font-weight: 700; margin: 1.6em 0 0.5em; color: #111; line-height: 1.35; border-bottom: 1px solid #eeeeee; padding-bottom: 5px; }
    .content h3 { font-size: 1.1rem; font-weight: 700; margin: 1.4em 0 0.4em; color: #222; }
    .content h4, .content h5, .content h6 { font-size: 1rem; font-weight: 700; margin: 1.2em 0 0.3em; color: #333; }

    .content p { margin-bottom: 1.1em; }

    .content a { color: #2563eb; text-decoration: underline; }
    .content strong { font-weight: 700; color: #111; }
    .content em { font-style: italic; }

    .content ul, .content ol { padding-left: 1.6em; margin-bottom: 1.1em; }
    .content li { margin-bottom: 0.25em; }
    .content li > ul, .content li > ol { margin-top: 0.25em; margin-bottom: 0.25em; }

    .content blockquote {
      margin: 1.4em 0;
      padding: 10px 18px;
      border-left: 3px solid #bbbbbb;
      background: #f9f9f9;
      color: #555555;
      font-style: italic;
    }
    .content blockquote p { margin: 0; }

    .content code {
      font-family: 'Courier New', monospace;
      font-size: 0.875em;
      background: #f3f3f3;
      border: 1px solid #e0e0e0;
      border-radius: 3px;
      padding: 1px 5px;
      color: #333;
    }

    .content pre {
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 16px 18px;
      margin: 1.4em 0;
      overflow-x: auto;
    }
    .content pre code { background: none; border: none; padding: 0; font-size: 0.875em; }

    .content img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 1.2em 0;
      display: block;
    }

    .content hr { border: none; border-top: 1px solid #e0e0e0; margin: 2em 0; }

    .content table { width: 100%; border-collapse: collapse; margin: 1.4em 0; font-size: 0.9em; }
    .content th, .content td { border: 1px solid #d0d0d0; padding: 8px 12px; text-align: left; }
    .content th { background: #f0f0f0; font-weight: 700; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .content tr:nth-child(even) td { background: #fafafa; }

    .content input[type="checkbox"] { margin-right: 6px; }

    @media print {
      .document { padding: 0; max-width: none; }
      .content pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
  <div class="document">
    <header class="doc-header">
      <h1 class="doc-title">${escapeHtml(options.title)}</h1>
      <p class="doc-date">${escapeHtml(options.dateDisplay)}</p>
      ${tagsHtml}
    </header>
    <div class="content">
      ${options.htmlContent}
    </div>
  </div>
</body>
</html>`
}
