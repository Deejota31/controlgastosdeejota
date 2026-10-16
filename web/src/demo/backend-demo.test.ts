import { describe, it, expect } from 'vitest'
import { crearBackendDemo, TOKEN_DEMO } from './backend-demo'

function almacenMemoria() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}
interface Resp {
  ok: boolean
  data?: Record<string, unknown>
  error?: { code: string }
  generacion?: string
}

describe('modo demostración (Code.gs real en el navegador)', () => {
  it('instala el backend y responde bootstrap con el catálogo inicial', async () => {
    const d = await crearBackendDemo({ almacen: almacenMemoria() })
    const r = (await d.enviar({ action: 'bootstrap', token: d.token, payload: {} })) as Resp
    expect(r.ok).toBe(true)
    const hojas = r.data?.hojas as Record<string, unknown[]>
    expect(hojas.ambitos).toHaveLength(5)
    expect(hojas.medios_pago).toHaveLength(6)
  })
  it('rechaza un token inválido', async () => {
    const d = await crearBackendDemo({ almacen: almacenMemoria() })
    const r = (await d.enviar({ action: 'bootstrap', token: 'x', payload: {} })) as Resp
    expect(r.error?.code).toBe('AUTH')
  })
  it('persiste entre sesiones: un segundo arranque conserva lo escrito', async () => {
    const almacen = almacenMemoria()
    const a = await crearBackendDemo({ almacen })
    const b0 = (await a.enviar({ action: 'bootstrap', token: TOKEN_DEMO, payload: {} })) as Resp
    const h = b0.data?.hojas as Record<string, Array<{ id: string; nombre: string; categoria_id?: string }>>
    const personal = h.ambitos!.find((x) => x.nombre === 'Personal')!
    const alim = h.categorias!.find((x) => x.nombre === 'Alimentación')!
    const alm = h.subcategorias!.find((x) => x.categoria_id === alim.id && x.nombre === 'Almuerzo')!
    const yape = h.medios_pago!.find((x) => x.nombre === 'Yape')!
    const w = (await a.enviar({
      action: 'movimiento.guardar', token: TOKEN_DEMO, requestId: 'demo-req-00000001',
      payload: { id: 'mov-demo-000001', fecha: '2026-10-15', monto: 12, moneda: 'PEN', ambito_id: personal.id, categoria_id: alim.id, subcategoria_id: alm.id, medio_pago_id: yape.id, descripcion: 'prueba' },
    })) as Resp
    expect(w, JSON.stringify(w)).toMatchObject({ ok: true })
    const b = await crearBackendDemo({ almacen })
    const r = (await b.enviar({ action: 'bootstrap', token: TOKEN_DEMO, payload: {} })) as Resp
    const movs = (r.data!.hojas as Record<string, Array<{ id: string; fecha: string }>>).movimientos!
    expect(movs).toHaveLength(1)
    expect(movs[0]!.fecha).toBe('2026-10-15')
  })
})
