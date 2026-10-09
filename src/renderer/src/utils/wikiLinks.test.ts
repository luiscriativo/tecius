import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { completeWikiLink, eventRelations, eventTexts, findBacklinks, linksToOldTitle, openWikiQuery, parseWikiLink, remarkWikiLinks, resolveWikiLink, snippetAround, suggestWikiTargets, wikiTextFor, type VaultEventDoc } from './wikiLinks'

const doc = (title: string, timelineTitle: string, date = '1500'): VaultEventDoc =>
  ({ filePath: `/v/${timelineTitle}/${title}.md`, slug: title, title, date, timelineDir: `/v/${timelineTitle}`, timelineTitle })
const docs = [
  doc('Cabral reaches Brazil', 'Exploration', '1500-04-22'),
  doc('Treaty of Tordesillas', 'Exploration', '1494'),
  doc('Fundação', 'Brasil', '1554'),
  doc('Fundação', 'Portugal', '1143'),
]

describe('parseWikiLink', () => {
  it('alvo e texto mostrado', () => {
    expect(parseWikiLink('Cabral reaches Brazil')).toEqual({ target: 'Cabral reaches Brazil', label: 'Cabral reaches Brazil' })
    expect(parseWikiLink('Cabral reaches Brazil|a chegada')).toEqual({ target: 'Cabral reaches Brazil', label: 'a chegada' })
  })
})

describe('resolveWikiLink', () => {
  it('acha pelo título, sem diferenciar maiúsculas e acentos', () => {
    expect(resolveWikiLink('treaty of TORDESILLAS', docs)?.date).toBe('1494')
    expect(resolveWikiLink('fundacao', docs, '/v/Brasil')?.timelineTitle).toBe('Brasil')
  })
  it('título repetido: Timeline/Título escolhe; sem isso, a timeline atual', () => {
    expect(resolveWikiLink('Portugal/Fundação', docs)?.date).toBe('1143')
    expect(resolveWikiLink('Fundação', docs, '/v/Portugal')?.date).toBe('1143')
  })
  it('inexistente', () => {
    expect(resolveWikiLink('Batalha de Guararapes', docs)).toBeNull()
  })
})

describe('wikiTextFor', () => {
  it('usa Timeline/Título só quando o título se repete', () => {
    expect(wikiTextFor(docs[0], docs)).toBe('Cabral reaches Brazil')
    expect(wikiTextFor(docs[3], docs)).toBe('Portugal/Fundação')
  })
})

describe('suggestWikiTargets', () => {
  it('filtra e põe primeiro o que começa com a busca e a timeline atual', () => {
    expect(suggestWikiTargets('tre', docs).map((d) => d.title)).toEqual(['Treaty of Tordesillas'])
    expect(suggestWikiTargets('fund', docs, '/v/Portugal')[0].timelineTitle).toBe('Portugal')
    expect(suggestWikiTargets('', docs).length).toBe(4)
  })
})

describe('openWikiQuery / completeWikiLink', () => {
  it('detecta o [[ aberto antes do cursor', () => {
    expect(openWikiQuery('veja [[Cab')).toBe('Cab')
    expect(openWikiQuery('veja [[')).toBe('')
    expect(openWikiQuery('veja [[Cabral]] e')).toBeNull()
    expect(openWikiQuery('veja')).toBeNull()
  })
  it('completa e aproveita o ]] que já existir', () => {
    expect(completeWikiLink('veja [[Cab e', 10, 'Cabral reaches Brazil').value).toBe('veja [[Cabral reaches Brazil]] e')
    expect(completeWikiLink('veja [[Cab]]', 10, 'Cabral reaches Brazil').value).toBe('veja [[Cabral reaches Brazil]]')
  })
})

describe('remarkWikiLinks', () => {
  const links = (md: string) => {
    const tree = unified().use(remarkParse).use(remarkWikiLinks).runSync(unified().use(remarkParse).parse(md)) as unknown as { children: Array<{ children: Array<{ type: string; data?: { hProperties?: Record<string, string> }; children?: Array<{ value: string }> }> }> }
    return tree.children[0].children.filter((n) => n.type === 'link').map((n) => [n.data?.hProperties?.['data-wiki'], n.children?.[0].value])
  }
  it('vira link com o alvo e o texto mostrado', () => {
    expect(links('Depois de [[Treaty of Tordesillas]], [[Cabral reaches Brazil|a chegada]].')).toEqual([
      ['Treaty of Tordesillas', 'Treaty of Tordesillas'], ['Cabral reaches Brazil', 'a chegada'],
    ])
  })
  it('não mexe em código', () => {
    expect(links('use `[[Título]]` para ligar')).toEqual([])
  })
})

describe('menções e renomeação', () => {
  const tord = { ...doc('Tratado de Tordesilhas', 'Descobrimentos', '1494'), body: 'Divide o mundo.' }
  const cabral = { ...doc('Cabral chega ao Brasil', 'Descobrimentos', '1500'), body: 'A frota avista a costa, dentro do limite do [[Tratado de Tordesilhas]].' }
  // Chronicle: o arquivo inteiro vem no 1º trecho
  const chr = (title: string, anchor: string, body = ''): VaultEventDoc => ({ filePath: '/v/Brasil/viagem.md', slug: 'viagem__' + anchor, title, date: '1501', timelineDir: '/v/Brasil', timelineTitle: 'Brasil', anchor, chronicleTitle: 'Viagem', body })
  const v1 = chr('Partida', 'partida', 'Saem de Lisboa. ^partida\n\nNa costa, lembram o [[tratado de tordesilhas|tratado]]. ^costa\n\nVoltam. ^volta')
  const v2 = chr('Costa', 'costa'), v3 = chr('Volta', 'volta')
  const all = [tord, cabral, v1, v2, v3]

  it('divide o texto do chronicle pelos trechos', () => {
    const t = eventTexts(all)
    expect(t.find((x) => x.doc === v2)!.text).toContain('[[tratado de tordesilhas|tratado]]')
    expect(t.find((x) => x.doc === v1)!.text).not.toContain('tratado')
  })
  it('acha quem menciona — no trecho certo do chronicle', () => {
    const b = findBacklinks(tord, all)
    expect(b.map((x) => x.doc.title)).toEqual(['Cabral chega ao Brasil', 'Costa'])
    expect(b[1].snippet).toBe('Na costa, lembram o tratado.')
    expect(findBacklinks(cabral, all)).toEqual([])
  })
  it('trecho em volta da menção, sem marcações', () => {
    expect(snippetAround('Um **dois** [[Três|três]] quatro. ^x', 12)).toBe('Um dois três quatro.')
  })
  it('ligações para o título antigo', () => {
    // "Tratado de Tordesilhas" foi renomeado: nenhum outro evento tem o nome antigo
    const renamed = [{ ...tord, title: 'Tratado de Tordesillas' }, cabral, v1, v2, v3]
    expect(linksToOldTitle('Tratado de Tordesilhas', 'Descobrimentos', renamed, tord)).toEqual({
      files: ['/v/Descobrimentos/Cabral chega ao Brasil.md', '/v/Brasil/viagem.md'], count: 2,
      targets: ['Tratado de Tordesilhas', 'Descobrimentos/Tratado de Tordesilhas'],
    })
    // Outro evento ainda se chama assim: só a forma com a timeline é deste
    const other = { ...doc('Tratado de Tordesilhas', 'Outra'), body: '' }
    expect(linksToOldTitle('Tratado de Tordesilhas', 'Descobrimentos', [...renamed, other], tord).count).toBe(0)
  })
})

describe('eventRelations', () => {
  const bio = { ...doc('Vida de Cabral', 'Pessoas', '1467'), body: 'Nasce em [[Belmonte]]. Comanda a frota: [[Chegada]], depois [[Calicute]] e de novo [[chegada|ela]]. [[Inexistente]].' }
  const belmonte = doc('Belmonte', 'Pessoas', '1467'), chegada = doc('Chegada', 'Descobrimentos', '1500')
  const calicute = { ...doc('Calicute', 'Descobrimentos', '1500-09'), body: 'Ver [[Vida de Cabral]].' }
  const all = [bio, belmonte, chegada, calicute]
  it('cita na ordem do texto, sem repetir; e quem cita', () => {
    const r = eventRelations(bio, all)
    expect(r.cites.map((d) => d.title)).toEqual(['Belmonte', 'Chegada', 'Calicute'])
    expect(r.citedBy.map((d) => d.title)).toEqual(['Calicute'])
    expect(eventRelations(chegada, all)).toEqual({ cites: [], citedBy: [bio] })
  })
})

describe('trechos vinculados (espelhos)', () => {
  const orig = { ...doc('Cabral chega ao Brasil', 'Descobrimentos', '1500'), body: 'Original.' }
  const mirror: VaultEventDoc = { filePath: '/v/P/vida.md', slug: 'vida__chr1', title: 'Cabral chega ao Brasil', date: '1500', timelineDir: '/v/P', timelineTitle: 'P', anchor: 'chegada', chronicleTitle: 'Vida', ref: 'Cabral chega ao Brasil', body: 'Nasce. ^nasc\n\nAvista terra, enfim. ^chegada' }
  const nasc: VaultEventDoc = { ...mirror, slug: 'vida__chr0', title: 'Nascimento', anchor: 'nasc', ref: undefined, body: '' }
  const all = [orig, mirror, nasc]
  it('ligações e sugestões ignoram o espelho, mesmo na timeline dele', () => {
    expect(resolveWikiLink('Cabral chega ao Brasil', all, '/v/P')).toBe(orig)
    expect(suggestWikiTargets('cabral', all, '/v/P')).toEqual([orig])
    expect(wikiTextFor(orig, all)).toBe('Cabral chega ao Brasil')
  })
  it('o original mostra o trecho vinculado em "Mencionado em"', () => {
    expect(findBacklinks(orig, all)).toEqual([{ doc: mirror, snippet: 'Avista terra, enfim.', linked: true }])
  })
})

describe('renomear com trechos vinculados', () => {
  // "Fundação" foi renomeado para "Fundação de São Paulo"; um trecho vinculado ainda tem o título antigo no índice
  const orig = { ...doc('Fundação de São Paulo', 'Brasil', '1554'), body: '' }
  const citer = { ...doc('Jesuítas', 'Brasil', '1553'), body: 'Antes da [[Fundação]].' }
  const mirror: VaultEventDoc = { filePath: '/v/P/vida.md', slug: 'vida__chr1', title: 'Fundação', date: '1554', timelineDir: '/v/P', timelineTitle: 'P', anchor: 'f', chronicleTitle: 'Vida', ref: 'Fundação', body: 'Texto. ^f' }
  it('o espelho não faz o título antigo parecer "ainda em uso" e o ref: entra na contagem', () => {
    const r = linksToOldTitle('Fundação', 'Brasil', [orig, citer, mirror], orig)
    expect(r.targets).toEqual(['Fundação', 'Brasil/Fundação'])
    expect(r.count).toBe(2)
    expect(r.files.sort()).toEqual(['/v/Brasil/Jesuítas.md', '/v/P/vida.md'])
  })
})
