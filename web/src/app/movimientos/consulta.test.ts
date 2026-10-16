import { describe, expect, it } from 'vitest'
import { hojasPrueba, mov } from '@/test/fixtures'
import { consultar, impactoLote, nombresDe, totalesDe, type Consulta } from './consulta'

const base: Consulta = { texto: '', estado: 'activos', desde: '', hasta: '', ambitos: [], categorias: [], medios: [], orden: 'fecha', dir: 'desc' }

function vista() {
  const h = hojasPrueba()
  h.movimientos = [
    mov({ id: 'a', fecha: '2026-10-01', descripcion: 'Café Con Leche', monto: 12.5, monto_base: 12.5 }),
    mov({ id: 'b', fecha: '2026-10-03', descripcion: 'Bus Al Trabajo', categoria_id: 'cat-t', subcategoria_id: 'sub-bus', monto: 3, monto_base: 3, medio_pago_id: 'med-tar' }),
    mov({ id: 'c', fecha: '2026-10-03', descripcion: 'Almuerzo', subcategoria_id: 'sub-alm', monto: 25, monto_base: 25, estado: 'anulado' }),
    mov({ id: 'd', fecha: '2026-09-28', descripcion: 'Cena USD', moneda: 'USD', monto: 10, tipo_cambio: null, monto_base: null }),
    mov({ id: 'e', fecha: '2026-10-03', descripcion: 'Taxi', monto: 40, monto_base: 40, creado_en: '2026-10-03T12:00:00Z' }),
  ]
  return h
}

describe('consultar', () => {
  const h = vista()
  const n = nombresDe(h)
  const ids = (q: Partial<Consulta>) => consultar(h, { ...base, ...q }, n).map((m) => m.id)

  it('por defecto: solo activos, fecha desc y a igual fecha el más reciente primero', () => {
    expect(ids({})).toEqual(['e', 'b', 'a', 'd'])
  })
  it('filtra por estado', () => {
    expect(ids({ estado: 'anulados' })).toEqual(['c'])
    expect(ids({ estado: 'todos' })).toHaveLength(5)
  })
  it('filtra por período inclusivo', () => {
    expect(ids({ desde: '2026-10-01', hasta: '2026-10-03' })).toEqual(['e', 'b', 'a'])
  })
  it('busca sin distinguir tildes ni mayúsculas, incluso por nombre de categoría o medio', () => {
    expect(ids({ texto: 'cafe' })).toEqual(['e', 'a', 'd']) // también por subcategoría «Café»
    expect(ids({ texto: 'con leche' })).toEqual(['a'])
    expect(ids({ texto: 'TRANSPORTE' })).toEqual(['b'])
    expect(ids({ texto: 'tarjeta' })).toEqual(['b'])
  })
  it('filtra por varios ámbitos, categorías y medios a la vez (AND entre filtros, OR dentro)', () => {
    expect(ids({ categorias: ['cat-t'] })).toEqual(['b'])
    expect(ids({ medios: ['med-tar', 'med-efe'] })).toEqual(['e', 'b', 'a', 'd'])
    expect(ids({ categorias: ['cat-t'], medios: ['med-efe'] })).toEqual([])
  })
  it('ordena por monto con «sin tipo de cambio» siempre al final', () => {
    expect(ids({ orden: 'monto', dir: 'desc' })).toEqual(['e', 'a', 'b', 'd'])
    expect(ids({ orden: 'monto', dir: 'asc' })).toEqual(['b', 'a', 'e', 'd'])
  })
  it('orden manual: lo ordenado primero, el resto por fecha', () => {
    const m = { ...h, orden_movimientos: [{ movimiento_id: 'a', orden: 0 }, { movimiento_id: 'd', orden: 1 }] }
    expect(consultar(m, { ...base, orden: 'manual' }, n).map((x) => x.id)).toEqual(['a', 'd', 'e', 'b'])
  })
})

describe('totalesDe', () => {
  it('suma en céntimos enteros, excluye anulados y avisa de los sin tipo de cambio', () => {
    const h = vista()
    const t = totalesDe(h.movimientos)
    expect(t).toEqual({ total: 1250 + 300 + 4000, cantidad: 3, mayor: 4000, sinTC: 1, anulados: 1 })
  })
  it('0.1 + 0.2 no deriva', () => {
    const t = totalesDe([mov({ id: 'x', monto: 0.1, monto_base: 0.1 }), mov({ id: 'y', monto: 0.2, monto_base: 0.2 })])
    expect(t.total).toBe(30)
  })
})

describe('impactoLote', () => {
  const sel = vista().movimientos
  it('anular solo afecta a activos', () => {
    const i = impactoLote(sel, 'anular')
    expect(i.aplican).toBe(4)
    expect(i.omitidos).toBe(1)
  })
  it('cambiar medio o categoría se bloquea si hay anulados', () => {
    expect(impactoLote(sel, 'medio').bloquea).toBe(true)
    expect(impactoLote(sel.filter((m) => m.estado === 'activo'), 'medio').bloquea).toBe(false)
  })
})
