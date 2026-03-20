/**
 * Main Process Entry Point
 *
 * Responsibilities:
 * - Create and manage BrowserWindow instances
 * - Register IPC handlers
 * - Enforce single-instance lock
 * - Configure auto-updater (prepared, not active)
 * - Handle graceful shutdown
 */

import { app, BrowserWindow, shell, nativeTheme, protocol, net, ipcMain } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc'

// ── Custom asset:// protocol ──────────────────────────────────────────────────
// Registrar ANTES do app.whenReady() é obrigatório.
// Serve arquivos locais do vault sem expor file:// ao renderer (bloqueado pelo
// same-origin quando o app roda em localhost no modo de desenvolvimento).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true, // Permite carregar sem restrições CSP — o protocolo já é seguro
    },
  },
])

// ── Environment flags ─────────────────────────────────────────────────────────
const isDev = !app.isPackaged

// ── Single instance lock ──────────────────────────────────────────────────────
// Prevents multiple instances of the app from running simultaneously.
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running — quit this one immediately.
  app.quit()
  process.exit(0)
}

// ── Window reference ──────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

/**
 * Creates the main application window with security best practices applied.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    // ── Dimensions ────────────────────────────────────────────────────────────
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,

    // ── Appearance ────────────────────────────────────────────────────────────
    show: false, // Hidden until 'ready-to-show' to avoid visual flash
    backgroundColor: '#09090b', // Matches the dark theme background
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },

    // ── Security: WebPreferences ──────────────────────────────────────────────
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // SECURITY: Context isolation separates the preload world from the renderer world.
      contextIsolation: true,
      // SECURITY: Disabling node integration prevents renderer from accessing Node APIs.
      nodeIntegration: false,
      // SECURITY: Sandbox restricts the renderer to a limited set of OS APIs.
      sandbox: true,
      // SECURITY: Do not allow the renderer to navigate or open new windows arbitrarily.
      navigateOnDragDrop: false,
      // SECURITY: Disables the experimental web platform features that could be abused.
      experimentalFeatures: false
    }
  })

  // ── Window events ─────────────────────────────────────────────────────────
  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()

    // Open DevTools automatically in development
    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  // ── Security: Prevent navigation to external URLs ─────────────────────────
  // Any navigation attempt is blocked — use shell.openExternal() for links.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined
    const isInternalUrl = appUrl ? url.startsWith(appUrl) : url.startsWith('file://')

    if (!isInternalUrl) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // ── Security: Block new window creation ───────────────────────────────────
  // Instead of opening a new BrowserWindow, open the URL in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ── Content Security Policy ───────────────────────────────────────────────
  // Em desenvolvimento: relaxa script-src para permitir o inline preamble do
  // React Fast Refresh (@vitejs/plugin-react) e o WebSocket do HMR.
  // Em produção: CSP estrito, sem unsafe-inline para scripts.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: asset:",
      "font-src 'self' data: https://fonts.gstatic.com",
      isDev
        ? "connect-src 'self' ws://localhost:* http://localhost:*"
        : "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // ── Load the app ─────────────────────────────────────────────────────────
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    // Development: load from the Vite dev server for hot module replacement
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Production: load from the compiled HTML file
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ── Window closed ─────────────────────────────────────────────────────────
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Second instance handler ───────────────────────────────────────────────────
// When a second instance tries to launch, focus the existing window instead.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Sync Electron's native theme with the OS preference
  nativeTheme.themeSource = 'system'

  // ── Protocolo asset:// ─────────────────────────────────────────────────────
  // Serve arquivos locais do vault. Suporta dois formatos de URL porque o
  // Chromium normaliza "asset:///C:/path" para "asset://c/path" (trata a letra
  // do drive como host). O formato preferido é "asset://local/C:/path".
  protocol.handle('asset', (request) => {
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.pathname)

    if (process.platform === 'win32') {
      // Formato novo: asset://local/C:/path → host='local', pathname='/C:/path'
      if (/^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1) // remove barra inicial → "C:/path"

      // Formato legado: Chromium normaliza asset:///C:/path para asset://c/path
      // → host='c' (letra do drive, lowercase), pathname='/path' (sem o drive)
      } else if (/^[a-zA-Z]$/.test(url.host)) {
        filePath = `${url.host.toUpperCase()}:${filePath}` // reconstrói "C:/path"
      }
    }

    // Monta URL file://:
    //   Windows: "C:/..."    → "file:///C:/..."
    //   Unix:    "/home/..." → "file:///home/..."
    const fileUrl = filePath.startsWith('/')
      ? `file://${filePath}`
      : `file:///${filePath}`
    return net.fetch(fileUrl)
  })

  // Register all IPC handlers before creating the window
  registerIpcHandlers()

  createWindow()

  // Configura o auto-updater depois da janela criada (só em produção)
  setupAutoUpdater()

  // macOS: Re-create the window when the dock icon is clicked and no windows exist
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// ── Quit when all windows are closed (non-macOS) ──────────────────────────────
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ── Graceful shutdown ────────────────────────────────────────────────────────
app.on('before-quit', () => {
  // Perform cleanup tasks here before the app exits:
  // - Close database connections
  // - Save application state
  // - Cancel pending requests
})

// ── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  // Não baixa automaticamente — o usuário decide quando instalar
  autoUpdater.autoDownload = false
  // Instala automaticamente ao fechar o app quando já baixado
  autoUpdater.autoInstallOnAppQuit = true

  // Informa o renderer quando uma nova versão está disponível
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    })
  })

  // Nenhuma atualização disponível — silencioso
  autoUpdater.on('update-not-available', () => {
    // noop — não notifica o usuário
  })

  // Download concluído: notifica o renderer para mostrar o banner "Reiniciar e instalar"
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', {
      version: info.version,
    })
  })

  // Erros de update — loga silenciosamente em produção
  autoUpdater.on('error', (err) => {
    console.error('[auto-updater] error:', err?.message ?? err)
  })

  // Usuário clicou em "Instalar agora" no banner do renderer
  ipcMain.on('update:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Verificação manual disparada pelo renderer (Settings → "Verificar atualizações")
  ipcMain.handle('update:check', async () => {
    try {
      return await autoUpdater.checkForUpdates()
    } catch (err) {
      return null
    }
  })

  // Aguarda 8s após o app carregar antes da primeira verificação
  // (evita atrasar a inicialização e garante que o renderer já está pronto)
  setTimeout(() => {
    if (!isDev) autoUpdater.checkForUpdates().catch(() => {})
  }, 8000)
}
