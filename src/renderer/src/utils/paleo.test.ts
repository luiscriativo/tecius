import { describe, expect, it } from 'vitest'
import { geologicPeriod, keyframeAge, nearestKeyframe, supercontinent, yearToMa } from './paleo'

describe('paleogeografia', () => {
  it('quadros-chave', () => {
    expect(keyframeAge(0.012)).toBe(0)        // < 1 Ma: mapa atual
    expect(keyframeAge(66)).toBe(66)
    expect(keyframeAge(65.6)).toBe(66)
    expect(keyframeAge(298)).toBe(300)        // acima de 100 Ma: de 5 em 5
    expect(keyframeAge(1000)).toBe(1000)
    expect(keyframeAge(1200)).toBeNull()      // fora do modelo
    expect(nearestKeyframe([66, 300], 120)).toBe(66)
    expect(nearestKeyframe([66, 300], 250)).toBe(300)
    expect(nearestKeyframe([], 250)).toBeNull()
    expect(yearToMa(-300e6)).toBe(300)
  })

  it('períodos e supercontinentes', () => {
    expect(geologicPeriod(66, 'pt')).toBe('Cretáceo')   // no limite, vale o mais antigo
    expect(geologicPeriod(65.9, 'en')).toBe('Paleogene')
    expect(geologicPeriod(100, 'pt')).toBe('Cretáceo')
    expect(geologicPeriod(300, 'pt')).toBe('Carbonífero')
    expect(geologicPeriod(0.01, 'pt')).toBe('Quaternário')
    expect(geologicPeriod(4400, 'en')).toBe('Hadean')
    expect(supercontinent(300, 'pt')).toBe('Pangeia')
    expect(supercontinent(66, 'pt')).toBeNull()
    expect(supercontinent(900, 'en')).toBe('Rodinia')
  })
})
