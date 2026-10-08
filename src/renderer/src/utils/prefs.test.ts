import { beforeEach, describe, expect, it } from 'vitest'
import { oneOf, readPref, writePref } from './prefs'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
} as Storage

describe('preferências', () => {
  beforeEach(() => store.clear())

  it('sem valor salvo, usa o padrão', () => {
    expect(readPref('map.trail', true)).toBe(true)
  })

  it('lembra o que foi gravado', () => {
    writePref('map.trail', false)
    writePref('map.speed', 2)
    expect(readPref('map.trail', true)).toBe(false)
    expect(readPref('map.speed', 1, oneOf([0.5, 1, 2, 4]))).toBe(2)
  })

  it('valor inválido, de outro tipo ou fora da lista volta ao padrão', () => {
    store.set('tecius:pref:a', '{quebrado')
    store.set('tecius:pref:b', '"texto"')
    store.set('tecius:pref:c', '"pizza"')
    expect(readPref('a', true)).toBe(true)
    expect(readPref('b', false)).toBe(false)
    expect(readPref('c', 'grid', oneOf(['grid', 'grouped']))).toBe('grid')
  })
})
