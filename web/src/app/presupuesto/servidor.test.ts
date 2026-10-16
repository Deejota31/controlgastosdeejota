import { describe, expect, it } from 'vitest'
import { crearBackendDemo } from '@/demo/backend-demo'
import { nuevoId } from '@/api/cliente'
import { hojasVacias, validarHojas, type Hojas } from '@/api/esquemas'
import { calcularMes, previsualizarCopia, previsualizarPlantillas } from './logica'

/**
 * El cliente calcula las vistas previas con su propio código; el servidor decide al escribir.
 * Esta prueba usa el Code.gs real (simulador) para comprobar que ambos dicen lo mismo.
 */
async function servidor() {
  const mem = new Map<string, string>()
  const be = await crearBackendDemo({ almacen: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) } })
  let n = 0
  const llamar = async <T = Record<string, any>>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const r = (await be.enviar({ action, payload, token: be.token, requestId: `req-${++n}-${Math.random().toString(36).slice(2)}` })) as { ok: boolean; data: T; error?: { message: string } }
    if (!r.ok) throw new Error(`${action}: ${r.error?.message}`)
    return r.data
  }
  const hojas = async (): Promise<Hojas> => {
    const d = await llamar<{ hojas: unknown }>('bootstrap')
    return { ...hojasVacias(), ...validarHojas(d.hojas).hojas }
  }
  return { llamar, hojas }
}

const cfg = { moneda_base: 'PEN' }

describe('Presupuesto cliente = servidor', () => {
  const FT = nuevoId('fue'), CT = nuevoId('caj'), CP = nuevoId('caj'), PL = nuevoId('pla'), FA = nuevoId('fue')

  it('copiar del mes anterior: la vista previa coincide y repetir no duplica', async () => {
    const s = await servidor()
    const h0 = await s.hojas()
    const cat = h0.categorias[0]!.id
    await s.llamar('fuente.guardar', { id: FT, nombre: 'Sueldo T', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-09', medios: [], aplicar_mes: '2026-09', monto_mes: 900 })
    await s.llamar('caja.guardar', { id: CT, nombre: 'Caja T', alcance: 'categoria', alcance_id: cat, monto_defecto: 200, aplicar_mes: '2026-09', monto_mes: 180 })
    const h = await s.hojas()

    const cliente = previsualizarCopia(h, '2026-10', new Set(), { [`fuente:${FT}`]: 950 })
    const srv = await s.llamar<{ filas: Array<{ tipo: string; id: string; monto: number; monto_anterior: number; accion: string }> }>('mes.copiarDeAnterior', { mes: '2026-10', previsualizar: true, montos: { [`fuente:${FT}`]: 950 } })
    expect(cliente.map((f) => [f.tipo, f.id, f.monto, f.montoAnterior, f.accion])).toEqual(srv.filas.map((f) => [f.tipo, f.id, f.monto, f.monto_anterior, f.accion]))
    expect(cliente.map((f) => f.accion)).toEqual(['crear', 'crear'])
    // La vista previa no escribió nada.
    expect((await s.hojas()).fuentes_mes.filter((x) => x.mes === '2026-10')).toHaveLength(0)

    const real = await s.llamar<{ aplicadas: number }>('mes.copiarDeAnterior', { mes: '2026-10', montos: { [`fuente:${FT}`]: 950 }, excluir: [{ tipo: 'caja', id: CT }] })
    expect(real.aplicadas).toBe(1)
    const h2 = await s.hojas()
    expect(h2.fuentes_mes.find((x) => x.mes === '2026-10')).toMatchObject({ fuente_id: FT, monto: 950, estado: 'aplicada' })
    expect(h2.cajas_mes.filter((x) => x.mes === '2026-10')).toHaveLength(0)
    // El mes de origen no se tocó y repetir no duplica ni pisa.
    expect(h2.fuentes_mes.find((x) => x.mes === '2026-09')!.monto).toBe(900)
    const otra = await s.llamar<{ aplicadas: number }>('mes.copiarDeAnterior', { mes: '2026-10', montos: { [`fuente:${FT}`]: 1 } })
    expect(otra.aplicadas).toBe(1) // solo la caja, que seguía pendiente
    const h3 = await s.hojas()
    expect(h3.fuentes_mes.filter((x) => x.mes === '2026-10')).toHaveLength(1)
    expect(h3.fuentes_mes.find((x) => x.mes === '2026-10')!.monto).toBe(950)
    expect(previsualizarCopia(h3, '2026-10').map((f) => f.accion)).toEqual(['existente', 'existente'])
  })

  it('plantillas mensuales: misma vista previa que el servidor y reaplicar no duplica', async () => {
    const s = await servidor()
    const cat = (await s.hojas()).categorias[0]!.id
    await s.llamar('caja.guardar', { id: CP, nombre: 'Caja P', alcance: 'categoria', alcance_id: cat, monto_defecto: 200 })
    await s.llamar('plantilla.guardar', { id: PL, tipo: 'caja', nombre: 'Caja P base', datos: { caja_id: CP, monto: 220 } })
    const h = await s.hojas()
    const cliente = previsualizarPlantillas(h, 'caja', '2026-11')
    const srv = await s.llamar<{ filas: Array<{ plantilla_id: string; accion: string; estado: string; monto: number }> }>('plantilla.aplicarMes', { tipo: 'caja', mes: '2026-11', previsualizar: true })
    expect(cliente.map((f) => [f.plantillaId, f.accion, f.estado, f.monto])).toEqual(srv.filas.map((f) => [f.plantilla_id, f.accion, f.estado, f.monto]))
    expect(cliente[0]!.accion).toBe('crear')

    const r1 = await s.llamar<{ escritas: number }>('plantilla.aplicarMes', { tipo: 'caja', mes: '2026-11' })
    expect(r1.escritas).toBe(1)
    const h2 = await s.hojas()
    expect(previsualizarPlantillas(h2, 'caja', '2026-11')[0]).toMatchObject({ accion: 'sin_cambios', estado: 'aplicada' })
    const r2 = await s.llamar<{ escritas: number }>('plantilla.aplicarMes', { tipo: 'caja', mes: '2026-11' })
    expect(r2.escritas).toBe(0)
    expect((await s.hojas()).cajas_mes.filter((x) => x.mes === '2026-11')).toHaveLength(1)
  })

  it('el cálculo del cliente sobre datos que escribió el servidor respeta el aislamiento por mes', async () => {
    const s = await servidor()
    const h0 = await s.hojas()
    await s.llamar('fuente.guardar', { id: FA, nombre: 'Sueldo A', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-09', medios: [], aplicar_mes: '2026-09', monto_mes: 1000 })
    await s.llamar('fuenteMes.aplicar', { fuente_id: FA, mes: '2026-10', monto: 700 })
    const h = await s.hojas()
    expect(calcularMes(h, cfg, '2026-09').presupuesto).toBe(100000)
    expect(calcularMes(h, cfg, '2026-10').presupuesto).toBe(70000)
    expect(calcularMes(h, cfg, '2026-11').presupuesto).toBe(0)
    expect(h0.fuentes).toHaveLength(0)
  })
})
