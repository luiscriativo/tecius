import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { FileSystemService } from './FileSystemService'

let dir: string
let svc: FileSystemService
const write = (rel: string, text: string) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf-8'); return p }
const read = (p: string) => fs.readFileSync(p, 'utf-8')

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tecius-safety-'))
  svc = new FileSystemService()
  svc.setVaultPath(dir)
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('vault que não existe', () => {
  it('setVaultPath recusa uma pasta ausente em vez de abrir um vault vazio', () => {
    expect(() => new FileSystemService().setVaultPath(path.join(dir, 'nao-existe'))).toThrow(/não foi encontrada|not found/)
  })
  it('createTimeline não recria uma pasta-mãe que sumiu', () => {
    const gone = path.join(dir, 'sumiu')
    expect(() => svc.createTimeline('Nova', gone)).toThrow()
    expect(fs.existsSync(gone)).toBe(false)
  })
})

describe('renomear timeline e vault mantém o resto do cabeçalho', () => {
  it('troca só a linha title: (datas e comentários ficam como estavam)', () => {
    const meta = write('tl/_timeline.md', '---\ntitle: Antigo\ncreated: 2020-01-01   # data de criação\ntags: [a, b]\n---\n\nDescrição longa.\n')
    svc.renameTimeline(path.join(dir, 'tl'), 'Novo: título')
    expect(read(meta)).toBe('---\ntitle: "Novo: título"\ncreated: 2020-01-01   # data de criação\ntags: [a, b]\n---\n\nDescrição longa.\n')
  })
  it('acrescenta title: quando o cabeçalho não tem', () => {
    const meta = write('tl2/_timeline.md', '---\nicon: map\n---\n')
    svc.renameTimeline(path.join(dir, 'tl2'), 'Com título')
    expect(read(meta)).toBe('---\ntitle: Com título\nicon: map\n---\n')
  })
  it('renameVault cria _vault.md se não existir', () => {
    svc.renameVault('Meu vault')
    expect(read(path.join(dir, '_vault.md'))).toBe('---\ntitle: Meu vault\n---\n')
  })
})

describe('lixeira: evento com sub-timeline', () => {
  it('a pasta da sub-timeline vai junto para a lixeira e volta na restauração', () => {
    write('tl/_timeline.md', '---\ntitle: T\n---\n')
    const ev = write('tl/monumentos.md', '---\ntitle: Monumentos\ndate: 1900\n---\n')
    write('tl/monumentos/_timeline.md', '---\ntitle: Sub\n---\n')
    write('tl/monumentos/a.md', '---\ntitle: A\ndate: 1901\n---\n')

    svc.moveEventToVaultTrash(ev)
    expect(fs.existsSync(ev)).toBe(false)
    expect(fs.existsSync(path.join(dir, 'tl', 'monumentos'))).toBe(false)
    const item = svc.listTrash()[0]
    expect(item.eventCount).toBe(2)   // o evento e o da sub-timeline

    svc.restoreFromTrash(item.dirPath)
    expect(fs.existsSync(ev)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'tl', 'monumentos', 'a.md'))).toBe(true)
    expect(svc.listTrash()).toHaveLength(0)
  })
  it('item sem .md não é apagado em silêncio ao restaurar', () => {
    write('tl/_timeline.md', '---\ntitle: T\n---\n')
    const wrapper = path.join(dir, '.trash', '__event__x')
    fs.mkdirSync(wrapper, { recursive: true })
    fs.writeFileSync(path.join(wrapper, '_trash_meta.json'), JSON.stringify({ type: 'event', originalPath: path.join(dir, 'tl', 'x.md') }))
    expect(() => svc.restoreFromTrash(wrapper)).toThrow()
    expect(fs.existsSync(wrapper)).toBe(true)
  })
})

describe('contagem de eventos', () => {
  it('eventCount da timeline é só dela; totalEvents inclui as sub-timelines', () => {
    write('tl/_timeline.md', '---\ntitle: T\n---\n')
    write('tl/a.md', '---\ntitle: A\ndate: 1900\n---\n')
    write('tl/sub/_timeline.md', '---\ntitle: S\n---\n')
    write('tl/sub/b.md', '---\ntitle: B\ndate: 1901\n---\n')
    write('tl/sub/c.md', '---\ntype: chronicle\ntitle: C\nentries:\n  - title: x\n    date: 1902\n  - title: y\n    date: 1903\n---\n')
    const v = svc.readVault()
    expect(v.timelines[0].eventCount).toBe(1)
    expect(v.totalEvents).toBe(4)
  })
})

describe('trechos de chronicle: campos de data documentados', () => {
  it('time, date-end, circa e date-precision do trecho chegam ao evento', () => {
    write('tl/_timeline.md', '---\ntitle: T\n---\n')
    write('tl/v.md', '---\ntype: chronicle\ntitle: V\nentries:\n  - title: Guerra\n    date: 1914-07-28\n    date-end: 1918-11-11\n    circa: true\n    time: "10:30"\n    anchor: g\n---\n\nTexto. ^g\n')
    const [e] = svc.readTimeline(path.join(dir, 'tl')).events
    expect(e.frontmatter['date-end']).toBe('1918-11-11')
    expect(e.frontmatter.circa).toBe(true)
    expect(e.frontmatter.time).toBe('10:30')
  })
})
