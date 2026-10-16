import { describe, expect, it } from 'vitest'
import type { Compromiso, CompromisoPago, Conciliacion, GrupoFondos } from '@/api/esquemas'
import { calcularCompromisos } from '@/engine/compromisos'
import { prepararMovimientos } from '@/engine/movimientos'
import { hojasF3, hojasPrueba, mov } from '@/test/fixtures'
import {
  calcularCalidadDe, calcularSaludPresupuesto, candidatosAPago, diferenciaDe, fechaCorteDefecto, fuenteEnOtroGrupo, nivelCalidad, ordenarCompromisos, saldoCalculadoGrupo, sugerirClasificacion, verificacionesDe,
} from './logica'

const cfg = { moneda_base: 'PEN', monedas_permitidas: 'USD', tipo_cambio_USD: '3.75' }
const meta = { creado_en: '', actualizado_en: '', version: 1 }
const grupo = (p: Partial<GrupoFondos> = {}): GrupoFondos => ({ id: 'g1', nombre: 'Cuentas', fuente_ids_json: ['f1'], activo: true, ...meta, ...p })
const comp = (id: string, p: Partial<Compromiso> = {}): Compromiso => ({ id, plantilla_id: '', nombre: id, monto_previsto: 100, moneda: 'PEN', dia_vencimiento: 20, activo: true, ...meta, ...p })

describe('Mi presupuesto', () => {
  it('F3: disponible 550 menos compromisos pendientes; solo la caja excedida da alerta', () => {
    const h = hojasF3()
    h.compromisos = [comp('c1', { monto_previsto: 100 })]
    const s = calcularSaludPresupuesto(h, cfg, '2026-10')
    expect(s.disponible).toBe(550_00)
    expect(s.compromisosPendientes).toBe(100_00)
    expect(s.disponibleTrasCompromisos).toBe(450_00)
    expect(s.alertas.map((a) => [a.caja.caja.nombre, a.nivel])).toEqual([['Comida', 'excedida']])
  })
  it('los umbrales vienen de la configuración (60/80/100): Movilidad al 33 % sigue al día, a 70 % pasa a atención', () => {
    const h = hojasF3()
    h.movimientos.push(mov({ id: 'x', monto: 110, monto_base: 110, categoria_id: 'cat-t', subcategoria_id: 'sub-bus' }))
    expect(calcularSaludPresupuesto(h, { ...cfg, umbral_alertas: '60,80,100' }, '2026-10').alertas.map((a) => [a.caja.caja.nombre, a.nivel])).toEqual([['Comida', 'excedida'], ['Movilidad', 'atencion']])
  })
})

describe('Compromisos', () => {
  const h = hojasF3()
  const movs = prepararMovimientos(h.movimientos)
  const pagos = (l: Array<[string, string]>): CompromisoPago[] => l.map(([c, m], i) => ({ id: `p${i}`, compromiso_id: c, movimiento_id: m, mes: '2026-10', creado_en: '' }))
  const resumen = (cs: Compromiso[], p: CompromisoPago[]) => calcularCompromisos('2026-10', cs, p, movs, () => 3.75, 'PEN')

  it('vencidos primero, próximos por fecha, pendientes después y pagados al final', () => {
    const cs = [comp('pagado', { monto_previsto: 250 }), comp('lejano', { dia_vencimiento: 28 }), comp('vencido', { dia_vencimiento: 10 }), comp('proximo', { dia_vencimiento: 18 }), comp('sinmonto', { monto_previsto: null })]
    const r = ordenarCompromisos(resumen(cs, pagos([['pagado', 'm1']])), '2026-10-15')
    expect(r.map((f) => [f.compromiso.id, f.visible])).toEqual([['vencido', 'vencido'], ['proximo', 'proximo'], ['lejano', 'pendiente'], ['sinmonto', 'sin_monto'], ['pagado', 'pagado']])
    expect(r[0]!.dias).toBe(-5)
  })
  it('un mes pasado con saldo pendiente queda vencido; uno futuro no', () => {
    const r = resumen([comp('a')], [])
    expect(ordenarCompromisos(r, '2026-11-02')[0]!.visible).toBe('vencido')
    expect(ordenarCompromisos(r, '2026-09-20')[0]!.visible).toBe('pendiente')
  })
  it('pago parcial queda parcial y anular el pago deja de cubrir', () => {
    const cs = [comp('a', { monto_previsto: 400 })]
    expect(resumen(cs, pagos([['a', 'm1']])).items[0]!.estado).toBe('parcial')
    const anulado = { ...h, movimientos: h.movimientos.map((m) => (m.id === 'm1' ? { ...m, estado: 'anulado' as const } : m)) }
    const r = calcularCompromisos('2026-10', cs, pagos([['a', 'm1']]), prepararMovimientos(anulado.movimientos), () => 3.75, 'PEN')
    expect(r.items[0]!.pagado).toBe(0)
    expect(r.items[0]!.estado).toBe('pendiente')
  })
  it('candidatos: no ofrece movimientos que ya pagan a otro compromiso, anulados ni de otro mes', () => {
    const hh = hojasF3()
    hh.movimientos.push(mov({ id: 'viejo', fecha: '2026-09-02' }), mov({ id: 'anul', estado: 'anulado' }))
    hh.compromiso_pagos = pagos([['otro', 'm1'], ['a', 'm2']])
    const ids = candidatosAPago(hh, '2026-10', 'a').map((c) => c.id)
    expect(ids).toEqual(['m3'])
  })
})

describe('Calidad de datos', () => {
  it('un catálogo y movimientos sanos dan 100 y sin problemas', () => {
    const h = hojasPrueba()
    h.movimientos = [mov({ id: 'a' }), mov({ id: 'b', fecha: '2026-10-06', monto: 20, monto_base: 20 })]
    const { calidad } = calcularCalidadDe(h)
    expect(calidad.puntaje).toBe(100)
    expect(calidad.incompletos).toEqual([])
    expect(nivelCalidad(100).texto).toBe('Excelente')
    expect(nivelCalidad(75).tono).toBe('warn')
    expect(nivelCalidad(40).tono).toBe('danger')
  })
  it('detecta duplicados pendientes y baja el puntaje; marcarlo legítimo lo resuelve', () => {
    const h = hojasPrueba()
    h.movimientos = [mov({ id: 'a' }), mov({ id: 'b' })]
    const antes = calcularCalidadDe(h)
    expect(antes.duplicados).toHaveLength(1)
    expect(antes.calidad.puntaje).toBeLessThan(100)
    h.revisiones_calidad = [{ id: 'r', tipo_alerta: 'duplicado', firma: antes.duplicados[0]!.firma, movimiento_ids: ['a', 'b'], estado: 'legitimo', creado_en: '', actualizado_en: '' }]
    expect(calcularCalidadDe(h).calidad.puntaje).toBe(100)
  })
  it('un movimiento con subcategoría inactiva aparece con su sugerencia (activa, mismo ámbito)', () => {
    const h = hojasPrueba()
    h.subcategorias = h.subcategorias.map((s) => (s.id === 'sub-caf' ? { ...s, activo: false } : s))
    h.movimientos = [mov({ id: 'a' })]
    const { calidad } = calcularCalidadDe(h)
    expect(calidad.clasificacionInactiva[0]!.motivos).toContain('Subcategoría inactiva')
    const sug = sugerirClasificacion(h, 'a')!
    expect(sug.subcategoria_id).toBe('sub-alm')
    expect(sug.texto).toBe('Alimentación › Almuerzo')
  })
  it('sin sugerencia posible devuelve null y no inventa', () => {
    const h = hojasPrueba()
    h.ambitos = h.ambitos.map((a) => ({ ...a, activo: false }))
    h.movimientos = [mov({ id: 'a' })]
    expect(sugerirClasificacion(h, 'a')).toBeNull()
  })
})

describe('Conciliación de saldos', () => {
  const base = () => {
    const h = hojasF3()
    h.grupos_fondos = [grupo()]
    return h
  }
  it('el saldo calculado es el restante de las fuentes del grupo hasta la fecha de corte', () => {
    const h = base()
    expect(saldoCalculadoGrupo(h, cfg, h.grupos_fondos[0]!, '2026-10', '2026-10-15').cents).toBe(550_00)
    expect(saldoCalculadoGrupo(h, cfg, h.grupos_fondos[0]!, '2026-10', '2026-10-04').cents).toBe(1000_00)
  })
  it('una fuente no aplicada en el período no suma y se avisa', () => {
    const h = base()
    h.grupos_fondos = [grupo({ fuente_ids_json: ['f1', 'f9'] })]
    const s = saldoCalculadoGrupo(h, cfg, h.grupos_fondos[0]!, '2026-10', '2026-10-15')
    expect(s.sinAplicar).toEqual(['f9'])
    expect(s.cents).toBe(550_00)
  })
  it('la diferencia lleva signo y porcentaje sobre el calculado', () => {
    expect(diferenciaDe(550_00, 500_00)).toEqual({ cents: -50_00, pct: -50 / 550 })
    expect(diferenciaDe(550_00, 560_00).cents).toBe(10_00)
    expect(diferenciaDe(0, 10_00).pct).toBeNull()
  })
  it('la fecha de corte es hoy en el mes en curso y el último día en meses pasados', () => {
    expect(fechaCorteDefecto('2026-10', '2026-10-16')).toBe('2026-10-16')
    expect(fechaCorteDefecto('2026-09', '2026-10-16')).toBe('2026-09-30')
    expect(fechaCorteDefecto('2026-12', '2026-10-16')).toBe('2026-12-01')
  })
  const fila = (p: Partial<Conciliacion>): Conciliacion => ({
    id: 'v1', tipo: 'verificacion', conciliacion_id: 'k1', periodo: '2026-10', fecha_corte: '2026-10-15', hora: '10:00', grupo_id: 'g1', saldo_calculado: 550, saldo_real: 500, diferencia: -50,
    estado: 'pendiente', causa: '', observacion: '', reemplaza_a: '', creado_en: '2026-10-15T15:00:00Z', ...p,
  })
  it('estado vigente = último seguimiento; corregir reemplaza sin borrar; cambios posteriores la dejan desactualizada', () => {
    const h = base()
    h.conciliaciones = [
      fila({}),
      fila({ id: 's1', tipo: 'seguimiento', estado: 'en_revision', creado_en: '2026-10-15T16:00:00Z' }),
      fila({ id: 'v2', conciliacion_id: 'k2', saldo_real: 550, diferencia: 0, estado: 'conciliada', reemplaza_a: 'v1', creado_en: '2026-10-15T17:00:00Z' }),
    ]
    const v = verificacionesDe(h, cfg)
    expect(v.map((x) => x.verificacion.id)).toEqual(['v2', 'v1'])
    const v1 = v.find((x) => x.verificacion.id === 'v1')!
    const v2 = v.find((x) => x.verificacion.id === 'v2')!
    expect(v1.reemplazada).toBe(true)
    expect(v1.estado).toBe('en_revision')
    expect(v1.historial).toHaveLength(2)
    expect(v2.reemplazada).toBe(false)
    expect(v2.estado).toBe('conciliada')
    // El motor memoriza por identidad del arreglo: el store siempre entrega arreglos nuevos.
    h.movimientos = [...h.movimientos, mov({ id: 'nuevo', fecha: '2026-10-12', monto: 30, monto_base: 30 })]
    const despues = verificacionesDe(h, cfg).find((x) => x.verificacion.id === 'v2')!
    expect(despues.estado).toBe('desactualizada')
    expect(despues.estadoGuardado).toBe('conciliada')
  })
  it('un gasto posterior a la fecha de corte no desactualiza la verificación', () => {
    const h = base()
    h.conciliaciones = [fila({ saldo_calculado: 550, fecha_corte: '2026-10-15' })]
    h.movimientos.push(mov({ id: 'tarde', fecha: '2026-10-20', monto: 30, monto_base: 30 }))
    expect(verificacionesDe(h, cfg)[0]!.estado).toBe('pendiente')
  })
  it('cerrada con diferencia justificada no pasa a desactualizada', () => {
    const h = base()
    h.conciliaciones = [fila({}), fila({ id: 's', tipo: 'seguimiento', estado: 'cerrada_justificada', causa: 'Comisión bancaria', creado_en: '2026-10-15T18:00:00Z' })]
    h.movimientos.push(mov({ id: 'nuevo', fecha: '2026-10-12', monto: 30, monto_base: 30 }))
    const v = verificacionesDe(h, cfg)[0]!
    expect(v.estado).toBe('cerrada_justificada')
    expect(v.causa).toBe('Comisión bancaria')
  })
  it('una fuente solo puede estar en un grupo activo', () => {
    const gs = [grupo({ id: 'g1', fuente_ids_json: ['f1'] }), grupo({ id: 'g2', nombre: 'Otro', fuente_ids_json: ['f2'], activo: false })]
    expect(fuenteEnOtroGrupo(gs, 'f1', 'g3')?.id).toBe('g1')
    expect(fuenteEnOtroGrupo(gs, 'f1', 'g1')).toBeUndefined()
    expect(fuenteEnOtroGrupo(gs, 'f2', 'g3')).toBeUndefined()
  })
})
