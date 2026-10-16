import { describe, expect, it } from 'vitest'
import { layoutSankey, posicionarBurbujas } from './layout'

describe('burbujas', () => {
  it('no se superponen aunque tengan el mismo punto, y quedan dentro del área', () => {
    const datos = [
      { id: 'a', x: 5, y: 100, total: 5000 },
      { id: 'b', x: 5, y: 100, total: 4000 },
      { id: 'c', x: 5, y: 101, total: 3000 },
      { id: 'd', x: 20, y: 40, total: 900 },
    ]
    const r = posicionarBurbujas(datos, 400, 240)
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!
      expect(a.cx - a.r).toBeGreaterThanOrEqual(-0.01)
      expect(a.cx + a.r).toBeLessThanOrEqual(400.01)
      expect(a.cy - a.r).toBeGreaterThanOrEqual(-0.01)
      expect(a.cy + a.r).toBeLessThanOrEqual(240.01)
      for (let j = i + 1; j < r.length; j++) expect(Math.hypot(a.cx - r[j]!.cx, a.cy - r[j]!.cy)).toBeGreaterThanOrEqual(a.r + r[j]!.r - 0.5)
    }
  })
  it('es determinista y vacío no falla', () => {
    const d = [{ id: 'a', x: 1, y: 2, total: 10 }, { id: 'b', x: 2, y: 3, total: 20 }]
    expect(posicionarBurbujas(d, 300, 200)).toEqual(posicionarBurbujas(d, 300, 200))
    expect(posicionarBurbujas([], 300, 200)).toEqual([])
  })
})

describe('sankey', () => {
  const enlaces = [
    { origen: 'yape', destino: 'casa', valor: 300 },
    { origen: 'yape', destino: 'ocio', valor: 100 },
    { origen: 'tarjeta', destino: 'casa', valor: 200 },
    { origen: 'tarjeta', destino: 'ocio', valor: 0 },
  ]
  it('las alturas de los nodos suman lo mismo en ambos lados y los enlaces no se pisan', () => {
    const s = layoutSankey(enlaces, 200, 10)
    expect(s.enlaces).toHaveLength(3)
    const sumaO = s.origenes.reduce((a, n) => a + n.alto, 0)
    const sumaD = s.destinos.reduce((a, n) => a + n.alto, 0)
    expect(sumaO).toBeCloseTo(sumaD, 6)
    expect(s.origenes[0]!.id).toBe('yape')
    for (const n of [...s.origenes, ...s.destinos]) expect(n.y + n.alto).toBeLessThanOrEqual(200.001)
    const grosorYape = s.enlaces.filter((e) => e.origen === 'yape').reduce((a, e) => a + e.grosor, 0)
    expect(grosorYape).toBeCloseTo(s.origenes.find((n) => n.id === 'yape')!.alto, 6)
  })
  it('sin valores positivos no dibuja nada', () => {
    expect(layoutSankey([{ origen: 'a', destino: 'b', valor: 0 }], 100)).toEqual({ origenes: [], destinos: [], enlaces: [] })
  })
})
