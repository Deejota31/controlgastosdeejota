import { describe, expect, it } from 'vitest'
import { nuevoId } from '@/api/cliente'
import { hojasVacias, validarHojas, type Hojas } from '@/api/esquemas'
import { crearBackendDemo } from '@/demo/backend-demo'
import { calcularCompromisos } from '@/engine/compromisos'
import { prepararMovimientos } from '@/engine/movimientos'
import { calcularCalidadDe, saldoCalculadoGrupo, verificacionesDe } from './logica'

/** Las pantallas de Salud leen y escriben contra el Code.gs real (simulador): aquí se comprueba el contrato de punta a punta. */
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
  const f1 = nuevoId('fue'), f2 = nuevoId('fue')
  await s.llamar('fuente.guardar', { id: f1, nombre: 'Sueldo', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-10', medios: [medio.id], aplicar_mes: '2026-10', monto_mes: 1000 })
  await s.llamar('fuente.guardar', { id: f2, nombre: 'Extra', monto_defecto: 200, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-10', medios: [], aplicar_mes: '2026-10', monto_mes: 200 })
  const gasto = async (fecha: string, monto: number, descripcion: string) => {
    const id = nuevoId('mov')
    await s.llamar('movimiento.guardar', { id, fecha, ambito_id: amb.id, categoria_id: cat.id, subcategoria_id: sub?.id ?? '', descripcion, monto, moneda: 'PEN', medio_pago_id: medio.id, tipo_gasto: 'variable', es_recurrente: false })
    return id
  }
  return { s, f1, f2, gasto }
}

describe('Salud cliente → servidor', () => {
  it('grupos de fondos: una fuente solo puede estar en un grupo activo', async () => {
    const { s, f1, f2 } = await preparar()
    const g1 = nuevoId('gru')
    await s.llamar('grupoFondos.guardar', { id: g1, nombre: 'Cuentas', fuente_ids: [f1], activo: true })
    const choque = await s.crudo('grupoFondos.guardar', { id: nuevoId('gru'), nombre: 'Otro', fuente_ids: [f1, f2], activo: true })
    expect(choque.ok).toBe(false)
    expect(choque.error?.message).toMatch(/solo puede estar en un grupo activo/)
    // Como inactivo sí se permite, y el cliente lo lee igual.
    await s.llamar('grupoFondos.guardar', { id: nuevoId('gru'), nombre: 'Archivado', fuente_ids: [f1], activo: false })
    const h = await s.hojas()
    expect(h.grupos_fondos.map((g) => [g.nombre, g.activo, g.fuente_ids_json])).toEqual([['Cuentas', true, [f1]], ['Archivado', false, [f1]]])
  })

  it('verificar es de solo agregar: corregir suma una fila, no crea movimientos y el cliente reconstruye los estados', async () => {
    const { s, f1, gasto } = await preparar()
    await gasto('2026-10-05', 250, 'Compra')
    const gid = nuevoId('gru')
    await s.llamar('grupoFondos.guardar', { id: gid, nombre: 'Cuentas', fuente_ids: [f1], activo: true })
    const antes = await s.hojas()
    const grupo = antes.grupos_fondos[0]!
    const calculado = saldoCalculadoGrupo(antes, cfg, grupo, '2026-10', '2026-10-15')
    expect(calculado.cents).toBe(750_00)

    const idV1 = nuevoId('con'), cid1 = nuevoId('cid')
    const v1 = await s.llamar('conciliacion.verificar', { id: idV1, conciliacion_id: cid1, grupo_id: gid, periodo: '2026-10', fecha_corte: '2026-10-15', hora: '10:30', saldo_calculado: 750, saldo_real: 700 })
    expect(v1.conciliacion).toMatchObject({ diferencia: -50, estado: 'pendiente', tipo: 'verificacion' })
    // Reintentar con el mismo id no duplica.
    const retry = await s.llamar('conciliacion.verificar', { id: idV1, conciliacion_id: cid1, grupo_id: gid, periodo: '2026-10', fecha_corte: '2026-10-15', hora: '10:30', saldo_calculado: 750, saldo_real: 700 })
    expect(retry.existente).toBe(true)
    expect((await s.hojas()).conciliaciones).toHaveLength(1)

    // Seguimiento: cerrar con diferencia justificada exige causa.
    const sinCausa = await s.crudo('conciliacion.seguimiento', { id: nuevoId('seg'), conciliacion_id: cid1, estado: 'cerrada_justificada' })
    expect(sinCausa.ok).toBe(false)
    await s.llamar('conciliacion.seguimiento', { id: nuevoId('seg'), conciliacion_id: cid1, estado: 'en_revision', observacion: 'Pidiendo estado de cuenta' })

    // Corregir: nueva verificación que reemplaza a la anterior.
    const idV2 = nuevoId('con'), cid2 = nuevoId('cid')
    await s.llamar('conciliacion.verificar', { id: idV2, conciliacion_id: cid2, grupo_id: gid, periodo: '2026-10', fecha_corte: '2026-10-15', hora: '11:00', saldo_calculado: 750, saldo_real: 750, reemplaza_a: idV1 })

    const h = await s.hojas()
    expect(h.conciliaciones).toHaveLength(3)
    // La primera fila quedó intacta.
    expect(h.conciliaciones.find((c) => c.id === idV1)).toMatchObject({ saldo_real: 700, diferencia: -50, estado: 'pendiente' })
    // Nunca se crearon movimientos para cuadrar.
    expect(h.movimientos).toHaveLength(antes.movimientos.length)

    const v = verificacionesDe(h, cfg)
    const vigente = v.find((x) => x.verificacion.id === idV2)!
    const vieja = v.find((x) => x.verificacion.id === idV1)!
    expect(vigente.estado).toBe('conciliada')
    expect(vieja.reemplazada).toBe(true)
    expect(vieja.estado).toBe('en_revision')
    expect(vieja.historial).toHaveLength(2)

    // Un gasto olvidado dentro del período deja la verificación desactualizada.
    await gasto('2026-10-10', 30, 'Olvidado')
    const h2 = await s.hojas()
    expect(verificacionesDe(h2, cfg).find((x) => x.verificacion.id === idV2)!.estado).toBe('desactualizada')
  })

  it('cerrar con diferencia justificada guarda la causa y el cliente la muestra', async () => {
    const { s, f1 } = await preparar()
    const gid = nuevoId('gru')
    await s.llamar('grupoFondos.guardar', { id: gid, nombre: 'Cuentas', fuente_ids: [f1], activo: true })
    const cid = nuevoId('cid')
    await s.llamar('conciliacion.verificar', { id: nuevoId('con'), conciliacion_id: cid, grupo_id: gid, periodo: '2026-10', fecha_corte: '2026-10-15', hora: '09:00', saldo_calculado: 1000, saldo_real: 990 })
    await s.llamar('conciliacion.seguimiento', { id: nuevoId('seg'), conciliacion_id: cid, estado: 'cerrada_justificada', causa: 'Comisión de mantenimiento' })
    const v = verificacionesDe(await s.hojas(), cfg)[0]!
    expect(v.estado).toBe('cerrada_justificada')
    expect(v.causa).toBe('Comisión de mantenimiento')
  })

  it('duplicados: revision.guardar actualiza la misma fila y el puntaje de calidad lo refleja', async () => {
    const { s, gasto } = await preparar()
    const a = await gasto('2026-10-07', 12, 'Menú')
    const b = await gasto('2026-10-07', 12, 'Menú')
    let h = await s.hojas()
    const { duplicados, calidad } = calcularCalidadDe(h)
    expect(duplicados).toHaveLength(1)
    expect(duplicados[0]!.movimientoIds.sort()).toEqual([a, b].sort())
    const antes = calidad.puntaje
    await s.llamar('revision.guardar', { tipo_alerta: 'duplicado', firma: duplicados[0]!.firma, estado: 'pendiente', movimiento_ids: [a, b] })
    await s.llamar('revision.guardar', { tipo_alerta: 'duplicado', firma: duplicados[0]!.firma, estado: 'legitimo', movimiento_ids: [a, b] })
    h = await s.hojas()
    expect(h.revisiones_calidad).toHaveLength(1)
    expect(h.revisiones_calidad[0]).toMatchObject({ estado: 'legitimo', movimiento_ids: [a, b] })
    expect(calcularCalidadDe(h).calidad.puntaje).toBeGreaterThan(antes)
  })

  it('compromisos: vincular, cubrir, anular el pago y desvincular dan los mismos números en cliente y servidor', async () => {
    const { s, gasto } = await preparar()
    const cid = nuevoId('com')
    await s.llamar('compromiso.guardar', { id: cid, nombre: 'Alquiler', monto_previsto: 300, moneda: 'PEN', dia_vencimiento: 5, activo: true })
    const pago = await gasto('2026-10-05', 300, 'Alquiler octubre')
    await s.llamar('compromiso.vincular', { compromiso_id: cid, movimiento_id: pago, mes: '2026-10' })
    const calc = async () => {
      const h = await s.hojas()
      return calcularCompromisos('2026-10', h.compromisos, h.compromiso_pagos, prepararMovimientos(h.movimientos), () => 1, 'PEN').items[0]!
    }
    expect((await calc()).estado).toBe('cubierto')
    const m = (await s.hojas()).movimientos.find((x) => x.id === pago)!
    await s.llamar('movimiento.anular', { id: pago, version: m.version })
    expect((await calc()).estado).toBe('pendiente')
    await s.llamar('movimiento.restaurar', { id: pago, version: m.version + 1 })
    expect((await calc()).estado).toBe('cubierto')
    await s.llamar('compromiso.desvincular', { compromiso_id: cid, movimiento_id: pago })
    expect((await calc()).estado).toBe('pendiente')
    // Un movimiento no puede pagar dos compromisos.
    const otro = nuevoId('com')
    await s.llamar('compromiso.guardar', { id: otro, nombre: 'Luz', monto_previsto: 100, moneda: 'PEN', dia_vencimiento: 8, activo: true })
    await s.llamar('compromiso.vincular', { compromiso_id: cid, movimiento_id: pago, mes: '2026-10' })
    expect((await s.crudo('compromiso.vincular', { compromiso_id: otro, movimiento_id: pago, mes: '2026-10' })).ok).toBe(false)
  })
})
