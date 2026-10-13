/**
 * Gera os ícones do app a partir de um único desenho:
 * T em Georgia Bold creme sobre fundo quase preto, com o losango laranja
 * dos destaques da timeline ao lado.
 *
 *   resources/icon.png  1024 px, na grade do macOS (margem e sombra do Dock);
 *                       usado no Mac, no Linux e como favicon
 *   resources/icon.ico  16–256 px, ocupando o quadro inteiro (Windows)
 *
 * Roda dentro do Electron para desenhar com o canvas do Chromium:
 *   npm run icons
 * Precisa da fonte Georgia instalada (vem com macOS e Windows).
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const RESOURCES = path.join(__dirname, '..', 'resources')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

// Desenho em coordenadas de um quadro de 512 px; roda no renderer
const DRAW = `(() => {
  const BG = '#171714', LETTER = '#F0EEE8', ACCENT = '#D35400'

  // Glifo em alta resolução, recortado justo na tinta
  const src = document.createElement('canvas')
  src.width = src.height = 1400
  const g = src.getContext('2d')
  g.font = 'bold 1000px Georgia'
  g.textAlign = 'center'
  g.fillStyle = LETTER
  g.fillText('T', 700, 1050)
  const px = g.getImageData(0, 0, 1400, 1400).data
  let x0 = 1400, y0 = 1400, x1 = 0, y1 = 0
  for (let y = 0; y < 1400; y++)
    for (let x = 0; x < 1400; x++)
      if (px[(y * 1400 + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
  const glyph = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }

  function roundRect(c, x, y, s, r) {
    c.beginPath()
    c.moveTo(x + r, y)
    c.arcTo(x + s, y, x + s, y + s, r)
    c.arcTo(x + s, y + s, x, y + s, r)
    c.arcTo(x, y + s, x, y, r)
    c.arcTo(x, y, x + s, y, r)
    c.closePath()
  }

  // macGrid: corpo de 824/1024 com sombra, como os ícones do Dock
  function render(size, macGrid) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const c = cv.getContext('2d')
    c.imageSmoothingQuality = 'high'
    const body = macGrid ? size * 824 / 1024 : size
    const off = (size - body) / 2
    const u = body / 512

    if (macGrid) {
      c.shadowColor = 'rgba(0, 0, 0, 0.3)'
      c.shadowBlur = size * 24 / 1024
      c.shadowOffsetY = size * 10 / 1024
    }
    roundRect(c, off, off, body, body * (macGrid ? 0.225 : 0.1875))
    c.fillStyle = BG
    c.fill()
    c.shadowColor = 'transparent'

    // Mesma caixa do T do ícone anterior, 5% menor e deslocada para dar lugar ao losango
    c.drawImage(src, glyph.x, glyph.y, glyph.w, glyph.h,
      off + 137.3 * u, off + 152.45 * u, 200.45 * u, 211 * u)

    const cx = off + 376 * u, cy = off + 344 * u, d = 18.4 * u
    c.beginPath()
    c.moveTo(cx, cy - d)
    c.lineTo(cx + d, cy)
    c.lineTo(cx, cy + d)
    c.lineTo(cx - d, cy)
    c.closePath()
    c.fillStyle = ACCENT
    c.fill()

    return cv.toDataURL('image/png')
  }

  return {
    png: render(1024, true),
    ico: ${JSON.stringify(ICO_SIZES)}.map((s) => render(s, false))
  }
})()`

const decode = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')

// ICO com as imagens em PNG (Windows Vista em diante)
function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  let offset = 6 + 16 * pngs.length
  pngs.forEach((data, i) => {
    const size = ICO_SIZES[i]
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  })
  return Buffer.concat([header, ...entries, ...pngs])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('about:blank')
  const out = await win.webContents.executeJavaScript(DRAW)

  fs.writeFileSync(path.join(RESOURCES, 'icon.png'), decode(out.png))
  fs.writeFileSync(path.join(RESOURCES, 'icon.ico'), buildIco(out.ico.map(decode)))
  console.log('Ícones gerados em resources/: icon.png (1024 px) e icon.ico (' + ICO_SIZES.join(', ') + ')')
  app.quit()
})
