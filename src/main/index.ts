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

import { app, BrowserWindow, shell, nativeTheme, protocol, net, ipcMain, Menu } from 'electron'
import { join, resolve, sep } from 'path'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipc'
import { fileSystemService } from './services/FileSystemService'

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
    title: 'Tecius',

    // ── Dimensions ────────────────────────────────────────────────────────────
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,

    // ── Appearance ────────────────────────────────────────────────────────────
    show: false, // Hidden until 'ready-to-show' to avoid visual flash
    backgroundColor: '#09090b', // Matches the dark theme background
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 21 }, // centralizado no cabeçalho de 56px da sidebar

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
      experimentalFeatures: false,
      // SECURITY: Disable DevTools in production builds.
      devTools: isDev,
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
  // Só o próprio app pode ser carregado na janela. Links http(s) abrem no
  // navegador; qualquer outro (file://, etc.) é só bloqueado — antes, um link
  // `file:///...` num .md navegava a janela para fora do app.
  const appIndexUrl = isDev
    ? process.env['ELECTRON_RENDERER_URL']
    : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
  const openIfWeb = (url: string): void => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  }
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isInternalUrl = !!appIndexUrl && url.startsWith(appIndexUrl)
    if (!isInternalUrl) {
      event.preventDefault()
      openIfWeb(url)
    }
  })

  // ── Security: Block new window creation ───────────────────────────────────
  // Instead of opening a new BrowserWindow, open the URL in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openIfWeb(url)
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
  } else if (app.isReady()) {
    // macOS: o app continua rodando sem janela depois de fechá-la
    createWindow()
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Em produção, sem menu de Ver/DevTools. No macOS os atalhos de edição
  // (Cmd+C/V/X/Z/A) passam pelo menu Editar: sem ele, copiar, colar e desfazer
  // pelo teclado não funcionam — então o Mac fica só com App, Editar e Janela.
  if (!isDev) {
    Menu.setApplicationMenu(process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null)
  }

  // Sync Electron's native theme with the OS preference
  nativeTheme.themeSource = 'system'

  // ── Protocolo asset:// ─────────────────────────────────────────────────────
  // Serve arquivos locais do vault. Suporta dois formatos de URL porque o
  // Chromium normaliza "asset:///C:/path" para "asset://c/path" (trata a letra
  // do drive como host). O formato preferido é "asset://local/C:/path".
  protocol.handle('asset', (request) => {
    const url = new URL(request.url)
    // decodeURIComponent lança URIError com '%' solto no nome do arquivo
    let filePath: string
    try { filePath = decodeURIComponent(url.pathname) } catch { filePath = url.pathname }

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

    // Só arquivos do vault aberto: um .md recebido de terceiros não pode fazer o
    // app ler (e, na exportação HTML, embutir) qualquer arquivo do disco
    const vault = fileSystemService.getVaultPath()
    const abs = resolve(filePath)
    const root = vault ? resolve(vault) : null
    const inside = !!root && (abs === root || abs.startsWith(root.endsWith(sep) ? root : root + sep))
    if (!inside) return new Response(null, { status: 403 })

    // Monta URL file:// (pathToFileURL codifica '#', '?', '%' e espaços do nome):
    //   Windows: "C:/..."    → "file:///C:/..."
    //   Unix:    "/home/..." → "file:///home/..."
    return net.fetch(pathToFileURL(abs).toString())
  })

  // Register all IPC handlers before creating the window
  registerIpcHandlers()

  createWindow()

  // Configura o auto-updater depois da janela criada (só em produção)
  void setupAutoUpdater()

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

const RELEASES_URL = 'https://github.com/luiscriativo/tecius/releases'

/**
 * No macOS, o atualizador nativo só instala uma versão nova se o app estiver
 * assinado com certificado de desenvolvedor da Apple (Team ID). Sem ele (build
 * com assinatura ad-hoc), a atualização é manual: o aviso abre a página da
 * release para baixar o .dmg. Com certificado, volta sozinha ao fluxo automático.
 */
function canInstallUpdates(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(true)
  const bundle = resolve(process.execPath, '..', '..', '..')   // .../Tecius.app
  // Assíncrono: o codesign levava alguns segundos e travava a abertura do app
  return new Promise((done) => {
    execFile('codesign', ['-dv', bundle], { encoding: 'utf8' }, (_err, stdout, stderr) => {
      done(/TeamIdentifier=(?!not set)/.test(`${stdout ?? ''}${stderr ?? ''}`))
    })
  })
}

async function setupAutoUpdater(): Promise<void> {
  const manual = !(await canInstallUpdates())
  let availableVersion: string | null = null

  // Não baixa automaticamente — o usuário decide quando instalar
  autoUpdater.autoDownload = false
  // Instala automaticamente ao fechar o app quando já baixado
  autoUpdater.autoInstallOnAppQuit = !manual

  // Informa o renderer quando uma nova versão está disponível
  autoUpdater.on('update-available', (info) => {
    availableVersion = info.version
    mainWindow?.webContents.send('update:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      manual,
    })
  })

  // Nenhuma atualização disponível — silencioso
  autoUpdater.on('update-not-available', () => {
    // noop — não notifica o usuário
  })

  // Progresso do download — envia percentual ao renderer em tempo real
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
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

  // Usuário confirmou o download no banner (atualização manual: abre a página da release)
  ipcMain.handle('update:download', async () => {
    if (manual) {
      await shell.openExternal(availableVersion ? `${RELEASES_URL}/tag/v${availableVersion}` : `${RELEASES_URL}/latest`)
      return
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      console.error('[auto-updater] download error:', err)
    }
  })

  // Verificação manual disparada pelo renderer (Configurações → "Verificar atualizações").
  // Devolve só dados simples: o resultado do electron-updater tem objetos que não
  // atravessam o IPC. Se houver versão nova, o banner aparece pelo 'update:available'.
  ipcMain.handle('update:check', async () => {
    if (isDev) return { ok: false, current: app.getVersion() }
    try {
      const r = await autoUpdater.checkForUpdates()
      return { ok: true, current: app.getVersion(), available: r?.isUpdateAvailable ?? false, version: r?.updateInfo?.version ?? null }
    } catch {
      return { ok: false, current: app.getVersion() }
    }
  })

  // Aguarda 8s após o app carregar antes da primeira verificação
  // (evita atrasar a inicialização e garante que o renderer já está pronto)
  setTimeout(() => {
    if (!isDev) autoUpdater.checkForUpdates().catch(() => {})
  }, 8000)
}
