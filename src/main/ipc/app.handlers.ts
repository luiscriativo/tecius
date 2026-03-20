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

export function registerAppHandlers(): void {
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
      title: 'Exportar como PDF',
      defaultPath: `${options.suggestedName}.pdf`,
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
<html lang="pt">
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
