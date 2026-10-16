import { describe, expect, it } from 'vitest'
import { nuevoId } from '@/api/cliente'
import { hojasVacias, validarHojas, type Hojas } from '@/api/esquemas'
import { crearBackendDemo } from '@/demo/backend-demo'
import { construirLote, filasDeGastos } from './logica'

/** El lote que arma el cliente debe ser aceptado tal cual por el Code.gs real (simulador). */
async function servidor() {
  const mem = new Map<string, string>()
  const be = await crearBackendDemo({ almacen: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) } })
  const crudo = async (action: string, payload: Record<string, unknown> = {}) => (await be.enviar({ action, payload, token: be.token, requestId: nuevoId('req') })) as { ok: boolean; data: any; error?: { code: string; message: string } }
  const llamar = async (action: string, payload: Record<string, unknown> = {}) => {
    const r = await crudo(action, payload)
    if (!r.ok) throw new Error(`${action}: ${r.error?.message}`)
    return r.data
  }
  const hojas = async (): Promise<Hojas> => ({ ...hojasVacias(), ...validarHojas((await llamar('bootstrap')).hojas).hojas })
  return { llamar, crudo, hojas }
}

const cfg = { moneda_base: 'PEN' }

async function preparar() {
  const s = await servidor()
  const h0 = await s.hojas()
  const amb = h0.ambitos[0]!
  const cat = h0.categorias.find((c) => h0.ambito_categoria.some((v) => v.categoria_id === c.id && v.ambito_id === amb.id && v.activo))!
  const sub = h0.subcategorias.find((x) => x.categoria_id === cat.id && x.activo)
  const medio = h0.medios_pago.find((m) => m.activo)!
  const datos = { ambito_id: amb.id, categoria_id: cat.id, subcategoria_id: sub?.id ?? '', descripcion: 'Alquiler', monto: 1500, moneda: 'PEN', medio_pago_id: medio.id, tipo_gasto: 'fijo', es_recurrente: true, es_compromiso: true, dia_vencimiento: 5 }
  const idPl = nuevoId('pla')
  await s.llamar('plantilla.guardar', { id: idPl, tipo: 'gasto', nombre: 'Alquiler', datos, activo: true })
  const idPl2 = nuevoId('pla')
  await s.llamar('plantilla.guardar', { id: idPl2, tipo: 'gasto', nombre: 'Agua', datos: { ...datos, descripcion: 'Agua', monto: 40, es_compromiso: false, dia_vencimiento: undefined, tipo_gasto: 'variable' }, activo: true })
  return { s, idPl, idPl2 }
}

describe('Gastos del mes cliente → servidor', () => {
  it('la plantilla guardada por el servidor se lee igual en el cliente y crea su compromiso', async () => {
    const { s, idPl } = await preparar()
    const h = await s.hojas()
    const filas = filasDeGastos(h, cfg, '2026-10')
    expect(filas).toHaveLength(2)
    expect(filas.every((f) => f.revision === null)).toBe(true)
    const alq = filas.find((f) => f.plantilla.id === idPl)!
    expect(alq.compromiso?.compromiso.plantilla_id).toBe(idPl)
    expect(alq.compromiso?.compromiso.monto_previsto).toBe(1500)
    expect(alq.compromiso?.estado).toBe('pendiente')
  })

  it('registrar el lote crea los gastos, vincula el compromiso una vez y es idempotente', async () => {
    const { s } = await preparar()
    const filas = filasDeGastos(await s.hojas(), cfg, '2026-10')
    const lote = nuevoId('lote')
    const items = construirLote('2026-10-05', filas.map((fila) => ({ fila, edicion: { monto: String(fila.datos.monto), moneda: fila.datos.moneda, medio: fila.datos.medio_pago_id }, id: nuevoId('mov') })))
    const r1 = await s.llamar('movimientos.lote', { lote_id: lote, items })
    expect(r1.creados).toBe(2)
    const h = await s.hojas()
    expect(h.movimientos).toHaveLength(2)
    expect(h.movimientos.every((m) => m.lote_id === lote && m.origen === 'lote')).toBe(true)
    const compr = filasDeGastos(h, cfg, '2026-10').find((f) => f.compromiso)!.compromiso!
    expect(compr.estado).toBe('cubierto')
    expect(h.compromiso_pagos).toHaveLength(1)

    // Reintento con el mismo lote: no duplica gastos ni pagos.
    const r2 = await s.llamar('movimientos.lote', { lote_id: lote, items })
    expect(r2).toMatchObject({ creados: 0, existente: true })
    const h2 = await s.hojas()
    expect(h2.movimientos).toHaveLength(2)
    expect(h2.compromiso_pagos).toHaveLength(1)

    // Anular el pago deja de cubrir el compromiso; restaurarlo lo vuelve a cubrir.
    const idAlq = h2.compromiso_pagos[0]!.movimiento_id
    const m = h2.movimientos.find((x) => x.id === idAlq)!
    await s.llamar('movimiento.anular', { id: m.id, version: m.version })
    expect(filasDeGastos(await s.hojas(), cfg, '2026-10').find((f) => f.compromiso)!.compromiso!.estado).toBe('pendiente')
    const anulado = (await s.hojas()).movimientos.find((x) => x.id === idAlq)!
    await s.llamar('movimiento.restaurar', { id: anulado.id, version: anulado.version })
    expect(filasDeGastos(await s.hojas(), cfg, '2026-10').find((f) => f.compromiso)!.compromiso!.estado).toBe('cubierto')
  })

  it('todo o nada: un gasto inválido en el lote no deja escribir ninguno', async () => {
    const { s } = await preparar()
    const filas = filasDeGastos(await s.hojas(), cfg, '2026-10')
    const items = construirLote('2026-10-05', filas.map((fila) => ({ fila, edicion: { monto: String(fila.datos.monto), moneda: fila.datos.moneda, medio: fila.datos.medio_pago_id }, id: nuevoId('mov') })))
    ;(items[1] as { monto: number }).monto = -5
    const r = await s.crudo('movimientos.lote', { lote_id: nuevoId('lote'), items })
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('VALIDATION')
    const h = await s.hojas()
    expect(h.movimientos).toHaveLength(0)
    expect(h.compromiso_pagos).toHaveLength(0)
  })

  it('un movimiento solo puede pagar un compromiso', async () => {
    const { s, idPl } = await preparar()
    const h = await s.hojas()
    const fila = filasDeGastos(h, cfg, '2026-10').find((f) => f.plantilla.id === idPl)!
    const id = nuevoId('mov')
    await s.llamar('movimientos.lote', { lote_id: nuevoId('lote'), items: construirLote('2026-10-05', [{ fila, edicion: { monto: '1500', moneda: 'PEN', medio: fila.datos.medio_pago_id }, id }]) })
    const otro = nuevoId('com')
    await s.llamar('compromiso.guardar', { id: otro, nombre: 'Otro', monto_previsto: 10, moneda: 'PEN', dia_vencimiento: 1 })
    const r = await s.crudo('compromiso.vincular', { compromiso_id: otro, movimiento_id: id })
    expect(r.ok).toBe(false)
    expect(r.error?.message).toMatch(/ya paga otro compromiso/)
  })

  it('eliminar la plantilla conserva el compromiso y sus pagos', async () => {
    const { s, idPl } = await preparar()
    await s.llamar('plantilla.eliminar', { id: idPl, confirmar: true })
    const h = await s.hojas()
    expect(h.compromisos).toHaveLength(1)
    expect(h.compromisos[0]!.plantilla_id).toBe('')
    expect(h.plantillas.some((p) => p.id === idPl)).toBe(false)
  })
})
