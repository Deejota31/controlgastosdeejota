import { describe, expect, it } from 'vitest'
import type { Hojas, Plantilla } from '@/api/esquemas'
import { hojasPrueba, mov } from '@/test/fixtures'
import { construirLote, datosDe, filasDeGastos, filtrarGastos, motivoRevision, plantillaDuplicada, problemaDeFila, totalesPorMoneda, type DatosGasto } from './logica'

const meta = { creado_en: '', actualizado_en: '', version: 2 }
const cfg = { moneda_base: 'PEN', monedas_permitidas: 'USD', tipo_cambio_USD: '3.75' }

const base: DatosGasto = { ambito_id: 'amb-h', categoria_id: 'cat-s', subcategoria_id: 'sub-luz', descripcion: 'Recibo de luz', monto: 120, moneda: 'PEN', medio_pago_id: 'med-tar', tipo_gasto: 'fijo', es_recurrente: true, es_compromiso: true, dia_vencimiento: 10 }
const plantilla = (id: string, nombre: string, d: Partial<DatosGasto> = {}, orden = 1): Plantilla => ({ id, tipo: 'gasto', nombre, datos_json: { ...base, ...d }, orden, activo: true, ...meta })

function datos(): Hojas {
  const h = hojasPrueba()
  h.plantillas = [plantilla('p1', 'Luz', {}, 1), plantilla('p2', 'Café', { ambito_id: 'amb-p', categoria_id: 'cat-a', subcategoria_id: 'sub-caf', descripcion: 'Café', monto: null, es_compromiso: false, dia_vencimiento: null, tipo_gasto: 'variable', es_recurrente: false, medio_pago_id: 'med-efe' }, 2)]
  h.compromisos = [{ id: 'cmp1', plantilla_id: 'p1', nombre: 'Luz', monto_previsto: 120, moneda: 'PEN', dia_vencimiento: 10, activo: true, ...meta }]
  return h
}

describe('motivoRevision', () => {
  it('una plantilla con todo activo está lista', () => {
    expect(motivoRevision(datos(), base)).toBeNull()
  })
  it('detecta ámbito, categoría, subcategoría y medio inactivos o inexistentes', () => {
    const h = datos()
    h.ambitos[1] = { ...h.ambitos[1]!, activo: false }
    expect(motivoRevision(h, base)).toMatch(/ámbito «Hogar» está inactivo/)
    const h2 = datos()
    h2.ambito_categoria = h2.ambito_categoria.map((v) => (v.id === 'ac3' ? { ...v, activo: false } : v))
    expect(motivoRevision(h2, base)).toMatch(/categoría «Servicios» está inactiva en «Hogar»/)
    const h3 = datos()
    h3.subcategorias = h3.subcategorias.map((s) => (s.id === 'sub-luz' ? { ...s, activo: false } : s))
    expect(motivoRevision(h3, base)).toMatch(/subcategoría «Luz» está inactiva/)
    const h4 = datos()
    h4.medios_pago = h4.medios_pago.map((m) => (m.id === 'med-tar' ? { ...m, activo: false } : m))
    expect(motivoRevision(h4, base)).toMatch(/medio de pago «Tarjeta» está inactivo/)
    expect(motivoRevision(datos(), { ...base, categoria_id: 'nope' })).toMatch(/categoría ya no existe/)
  })
  it('exige subcategoría cuando la categoría las tiene', () => {
    expect(motivoRevision(datos(), { ...base, subcategoria_id: '' })).toMatch(/Falta elegir la subcategoría/)
  })
})

describe('filas y filtros', () => {
  it('enlaza el compromiso y calcula su estado del mes', () => {
    const h = datos()
    const [luz] = filasDeGastos(h, cfg, '2026-10')
    expect(luz!.compromiso?.estado).toBe('pendiente')
    expect(luz!.clasificacion).toBe('Servicios › Luz')
    h.movimientos = [mov({ id: 'm1', monto: 120, monto_base: 120, ambito_id: 'amb-h', categoria_id: 'cat-s', subcategoria_id: 'sub-luz' })]
    h.compromiso_pagos = [{ id: 'cp1', compromiso_id: 'cmp1', movimiento_id: 'm1', mes: '2026-10', creado_en: '' }]
    expect(filasDeGastos(h, cfg, '2026-10')[0]!.compromiso?.estado).toBe('cubierto')
    expect(filasDeGastos(h, cfg, '2026-11')[0]!.compromiso?.estado).toBe('pendiente')
  })
  it('filtra por texto sin tildes y por ámbito', () => {
    const filas = filasDeGastos(datos(), cfg, '2026-10')
    expect(filtrarGastos(filas, 'cafe', '').map((f) => f.plantilla.id)).toEqual(['p2'])
    expect(filtrarGastos(filas, '', 'amb-h').map((f) => f.plantilla.id)).toEqual(['p1'])
    expect(filtrarGastos(filas, 'servicios', '').map((f) => f.plantilla.id)).toEqual(['p1'])
  })
})

describe('lote', () => {
  it('valida monto, tipo de cambio y medio de cada fila', () => {
    const h = datos()
    const [luz, cafe] = filasDeGastos(h, cfg, '2026-10')
    expect(problemaDeFila(h, cfg, luz!, { monto: '120', moneda: 'PEN', medio: 'med-tar' })).toBeNull()
    expect(problemaDeFila(h, cfg, cafe!, { monto: '', moneda: 'PEN', medio: 'med-efe' })).toMatch(/monto/)
    expect(problemaDeFila(h, cfg, cafe!, { monto: '5.555', moneda: 'PEN', medio: 'med-efe' })).toMatch(/2 decimales/)
    expect(problemaDeFila(h, cfg, cafe!, { monto: '5', moneda: 'EUR', medio: 'med-efe' })).toMatch(/tipo de cambio EUR/)
    expect(problemaDeFila(h, cfg, cafe!, { monto: '5', moneda: 'PEN', medio: '' })).toMatch(/medio de pago/)
  })
  it('construye los items con la edición temporal y el compromiso, sin tocar la plantilla', () => {
    const h = datos()
    const [luz, cafe] = filasDeGastos(h, cfg, '2026-10')
    const items = construirLote('2026-10-15', [
      { fila: luz!, edicion: { monto: '130,50', moneda: 'PEN', medio: 'med-efe' }, id: 'mov-1' },
      { fila: cafe!, edicion: { monto: '6', moneda: 'USD', medio: 'med-efe' }, id: 'mov-2' },
    ])
    expect(items[0]).toMatchObject({ id: 'mov-1', fecha: '2026-10-15', monto: 130.5, medio_pago_id: 'med-efe', compromiso_id: 'cmp1', tipo_gasto: 'fijo', descripcion: 'Recibo de luz' })
    expect(items[1]).toMatchObject({ id: 'mov-2', monto: 6, moneda: 'USD' })
    expect(items[1]!.compromiso_id).toBeUndefined()
    expect(datosDe(h.plantillas[0]!).medio_pago_id).toBe('med-tar')
  })
  it('totales por moneda sin errores de coma flotante', () => {
    expect(totalesPorMoneda([{ monto: 0.1, moneda: 'PEN' }, { monto: 0.2, moneda: 'PEN' }, { monto: 5, moneda: 'USD' }])).toEqual([
      { moneda: 'PEN', cents: 30 },
      { moneda: 'USD', cents: 500 },
    ])
  })
})

describe('duplicados', () => {
  it('detecta una plantilla idéntica (sin distinguir tildes ni mayúsculas en la descripción)', () => {
    const h = datos()
    expect(plantillaDuplicada(h, { ...base, descripcion: 'RECIBO de luz' })?.id).toBe('p1')
    expect(plantillaDuplicada(h, { ...base, descripcion: 'RECIBO de luz' }, 'p1')).toBeNull()
    expect(plantillaDuplicada(h, { ...base, monto: 121 })).toBeNull()
  })
})
