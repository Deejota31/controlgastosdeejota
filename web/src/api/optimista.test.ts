import { describe, expect, it } from 'vitest'
import { hojasPrueba, mov } from '@/test/fixtures'
import { aplicarPendientes } from './optimista'

const ctx = { config: { moneda_base: 'PEN' }, ahora: '2026-10-16T10:00:00Z' }
const base = () => {
  const h = hojasPrueba()
  h.movimientos = [mov({ id: 'a' }), mov({ id: 'b', estado: 'anulado' }), mov({ id: 'c' })]
  return h
}

describe('reductores de lote', () => {
  it('anular y restaurar cambian solo lo que corresponde y suben la versión', () => {
    const h = aplicarPendientes(base(), [{ action: 'movimientos.accionLote', payload: { accion: 'anular', ids: ['a', 'b'] } }], ctx)
    expect(h.movimientos.map((m) => m.estado)).toEqual(['anulado', 'anulado', 'activo'])
    expect(h.movimientos[0]!.version).toBe(2)
    expect(h.movimientos[1]!.version).toBe(1) // ya estaba anulado
  })
  it('todo o nada: si falta un id no cambia ninguno', () => {
    const h = aplicarPendientes(base(), [{ action: 'movimientos.accionLote', payload: { accion: 'anular', ids: ['a', 'zzz'] } }], ctx)
    expect(h.movimientos.every((m, i) => m === base().movimientos[i] || m.estado === base().movimientos[i]!.estado)).toBe(true)
    expect(h.movimientos[0]!.estado).toBe('activo')
  })
  it('cambiar medio con un anulado en la selección no aplica nada', () => {
    const h = aplicarPendientes(base(), [{ action: 'movimientos.accionLote', payload: { accion: 'medio', ids: ['a', 'b'], medio_pago_id: 'med-tar' } }], ctx)
    expect(h.movimientos[0]!.medio_pago_id).toBe('med-efe')
  })
  it('cambiar categoría reclasifica toda la selección', () => {
    const h = aplicarPendientes(base(), [{ action: 'movimientos.accionLote', payload: { accion: 'categoria', ids: ['a', 'c'], ambito_id: 'amb-p', categoria_id: 'cat-t', subcategoria_id: 'sub-bus' } }], ctx)
    expect(h.movimientos.filter((m) => m.categoria_id === 'cat-t').map((m) => m.id)).toEqual(['a', 'c'])
  })
  it('reordenar fusiona con el orden existente', () => {
    const h0 = { ...base(), orden_movimientos: [{ movimiento_id: 'a', orden: 5 }] }
    const h = aplicarPendientes(h0, [{ action: 'movimientos.reordenar', payload: { items: [{ movimiento_id: 'c', orden: 0 }, { movimiento_id: 'a', orden: 1 }] } }], ctx)
    expect(h.orden_movimientos.sort((x, y) => x.orden - y.orden)).toEqual([{ movimiento_id: 'c', orden: 0 }, { movimiento_id: 'a', orden: 1 }])
  })
})
