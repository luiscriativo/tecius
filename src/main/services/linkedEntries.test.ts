import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemService } from './FileSystemService'

let dir: string
let svc: FileSystemService
const write = (rel: string, text: string) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf-8'); return p }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tecius-ref-'))
  svc = new FileSystemService()
  svc.setVaultPath(dir)
  write('desc/_timeline.md', '---\ntitle: Descobrimentos\n---\n')
  write('desc/cabral.md', '---\ntitle: "Cabral chega ao Brasil"\ndate: 1500-04-22\nlocation:\n  name: Porto Seguro\n  lat: -16.4\n  lng: -39.1\n---\nTexto.\n')
  write('pessoas/_timeline.md', '---\ntitle: Pessoas\n---\n')
  write('pessoas/vida.md', [
    '---', 'type: chronicle', 'title: "Vida de Cabral"', 'entries:',
    '  - title: "Nascimento"', '    date: 1467', '    anchor: nasc',
    '  - title: "Chegada (cópia antiga)"', '    date: 1499', '    anchor: chegada', '    ref: "cabral chega ao brasil"',
    '  - title: "Perdido"', '    date: 1510', '    anchor: perdido', '    ref: "Não existe"',
    '---', '', 'Nasce. ^nasc', '', 'Avista terra. ^chegada', '', 'Some. ^perdido', '',
  ].join('\n'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('trechos vinculados', () => {
  it('título, data e local vêm do original; sem original, a cópia do arquivo', () => {
    const evs = svc.readTimeline(path.join(dir, 'pessoas')).events
    const chegada = evs.find((e) => e.chronicle?.anchor === 'chegada')!
    expect(chegada.frontmatter.title).toBe('Cabral chega ao Brasil')
    expect(chegada.frontmatter.date).toBe('1500-04-22')
    expect((chegada.frontmatter.location as { name: string }).name).toBe('Porto Seguro')
    expect(chegada.frontmatter.refFilePath).toBe(path.join(dir, 'desc/cabral.md'))
    const perdido = evs.find((e) => e.chronicle?.anchor === 'perdido')!
    expect(perdido.frontmatter.title).toBe('Perdido')
    expect(perdido.frontmatter.refMissing).toBe(true)
  })
  it('acompanha o original quando ele muda', () => {
    const tl = path.join(dir, 'pessoas')
    expect(svc.readTimeline(tl).events.find((e) => e.chronicle?.anchor === 'chegada')!.frontmatter.date).toBe('1500-04-22')
    const p = path.join(dir, 'desc/cabral.md')
    fs.writeFileSync(p, fs.readFileSync(p, 'utf-8').replace('1500-04-22', '1500-04-23'))
    fs.utimesSync(p, new Date(), new Date(Date.now() + 5000))
    expect(svc.readTimeline(tl).events.find((e) => e.chronicle?.anchor === 'chegada')!.frontmatter.date).toBe('1500-04-23')
  })
  it('no índice, o trecho vinculado é marcado como espelho', () => {
    const docs = svc.buildSearchIndex()
    expect(docs.find((d) => d.anchor === 'chegada')!.ref).toBe('cabral chega ao brasil')
    expect(docs.find((d) => d.anchor === 'nasc')!.ref).toBeUndefined()
  })
})
