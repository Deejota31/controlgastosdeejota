import { describe, expect, it } from 'vitest'
import { ApiError, esperaReintento, nuevoId } from '@/api/cliente'
import { crearTransporteDemo } from '@/store/conexion'
import { leerParametrosDemo, urlConDemo, urlSinDemo } from './parametros'

describe('parámetros de la demo', () => {
  it('interpreta ?demo=N&latencia&falla&vacio', () => {
    expect(leerParametrosDemo('')).toBeNull()
    expect(leerParametrosDemo('?demo')).toMatchObject({ movimientos: 120, latenciaMs: 0, falla: null, vacio: false })
    expect(leerParametrosDemo('?demo=400&latencia=2000&falla=timeout&vacio=1')).toEqual({ movimientos: 400, latenciaMs: 2000, falla: 'timeout', vacio: true })
    expect(leerParametrosDemo('?demo=5&falla=raro')?.falla).toBeNull()
  })
  it('urlConDemo agrega ?demo conservando el resto y vuelve a Inicio', () => {
    expect(urlConDemo('https://x.app/')).toBe('/?demo#/')
    expect(urlConDemo('https://x.app/?otro=1#/movimientos')).toBe('/?otro=1&demo#/')
  })
  it('urlSinDemo quita solo los parámetros de demo', () => {
    expect(urlSinDemo('https://x.app/?demo=3&latencia=5&otro=1#/movimientos')).toBe('/?otro=1#/movimientos')
  })
})

describe('reintentos', () => {
  it('retroceso 1 s / 3 s / 7 s con ±20 % de variación', () => {
    expect(esperaReintento(1, 1000, () => 0.5)).toBe(1000)
    expect(esperaReintento(2, 1000, () => 0.5)).toBe(3000)
    expect(esperaReintento(3, 1000, () => 0.5)).toBe(7000)
    expect(esperaReintento(1, 1000, () => 0)).toBe(800)
    expect(esperaReintento(3, 1000, () => 1)).toBe(8400)
  })
})

describe('demo por URL', () => {
  const llamar = async (t: Awaited<ReturnType<typeof crearTransporteDemo>>, action: string, payload = {}, requestId?: string) =>
    (await t.transporte.enviar({ action, payload, token: t.token, requestId })) as { ok: boolean; data: any; error?: { code: string } }

  it('siembra de forma determinista, sin tocar localStorage', async () => {
    localStorage.clear()
    const pd = { movimientos: 150, latenciaMs: 0, falla: null, vacio: false } as const
    const a = await crearTransporteDemo(pd)
    const b = await crearTransporteDemo(pd)
    const ma = (await llamar(a, 'bootstrap')).data.hojas.movimientos
    const mb = (await llamar(b, 'bootstrap')).data.hojas.movimientos
    expect(ma.length).toBeGreaterThan(120)
    expect(ma.map((m: any) => [m.fecha, m.monto, m.descripcion])).toEqual(mb.map((m: any) => [m.fecha, m.monto, m.descripcion]))
    const h = (await llamar(a, 'bootstrap')).data.hojas
    expect(h.fuentes.length).toBe(2)
    expect(h.cajas.length).toBe(3)
    expect(localStorage.length).toBe(0)
  }, 60_000)

  it('vacio=1 deja solo el catálogo inicial', async () => {
    const t = await crearTransporteDemo({ movimientos: 50, latenciaMs: 0, falla: null, vacio: true })
    const h = (await llamar(t, 'bootstrap')).data.hojas
    expect(h.movimientos).toHaveLength(0)
    expect(h.ambitos).toHaveLength(5)
  })

  it('falla=timeout: el servidor aplica pero la respuesta se pierde; el reintento es idempotente', async () => {
    const t = await crearTransporteDemo({ movimientos: 5, latenciaMs: 0, falla: 'timeout', vacio: true })
    const h0 = (await llamar(t, 'bootstrap')).data.hojas
    const a = h0.ambitos[0], c = h0.categorias.find((x: any) => x.nombre === 'Alimentación'), s = h0.subcategorias.find((x: any) => x.categoria_id === c.id), m = h0.medios_pago[0]
    const idMov = nuevoId('mov')
    const payload = { id: idMov, fecha: '2026-10-15', monto: 12.5, moneda: 'PEN', ambito_id: a.id, categoria_id: c.id, subcategoria_id: s.id, descripcion: 'TEST café', medio_pago_id: m.id, tipo_gasto: 'variable' }
    await expect(llamar(t, 'movimiento.guardar', payload, 'r-fallo-1')).rejects.toBeInstanceOf(ApiError)
    const r = await llamar(t, 'movimiento.guardar', payload, 'r-fallo-1')
    expect(r.error ?? r.ok).toBe(true)
    const movs = (await llamar(t, 'bootstrap')).data.hojas.movimientos
    expect(movs.filter((x: any) => x.id === idMov)).toHaveLength(1)
  })

  it('falla=busy devuelve BUSY transitorio', async () => {
    const t = await crearTransporteDemo({ movimientos: 5, latenciaMs: 0, falla: 'busy', vacio: true })
    const r = await llamar(t, 'movimiento.anular', { id: 'x' }, 'r-busy')
    expect(r.error?.code).toBe('BUSY')
  })
})
