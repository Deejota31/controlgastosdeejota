import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearBackendDemo, type BackendDemo } from '@/demo/backend-demo'
import { ApiError, crearCliente, type Transporte } from '@/api/cliente'
import { Cola, almacenMemoria as colaMemoria, type Almacen } from '@/api/cola'
import { crearDatos } from './datos'
import { useToasts } from './toasts'

function almacenMemoria() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

type Modo = 'ok' | 'caido' | 'pierdeRespuesta'
function transporteDe(backend: BackendDemo) {
  const ctl = { modo: 'ok' as Modo, llamadas: [] as Array<{ action: string; requestId?: string }> }
  const transporte: Transporte = {
    async enviar(p) {
      ctl.llamadas.push({ action: p.action, requestId: p.requestId })
      if (ctl.modo === 'caido') throw new ApiError('RED', 'sin red')
      const r = await backend.enviar(p)
      if (ctl.modo === 'pierdeRespuesta') {
        ctl.modo = 'ok'
        throw new ApiError('TIEMPO', 'se perdió la respuesta')
      }
      return r
    },
  }
  return { ctl, transporte }
}

async function dispositivo(backend: BackendDemo, almacenCola?: Almacen) {
  const { ctl, transporte } = transporteDe(backend)
  const cliente = crearCliente(() => ({ transporte, token: backend.token }))
  const cola = new Cola()
  if (almacenCola) await cola.usarAlmacen(almacenCola)
  const d = crearDatos({ cliente, cola, sinInstantanea: true, esperaReintentoMs: () => 30 })
  await d.store.getState().iniciar()
  return { ...d, ctl, estado: () => d.store.getState() }
}

function refs(s: ReturnType<ReturnType<typeof crearDatos>['store']['getState']>) {
  const h = s.vista
  const personal = h.ambitos.find((a) => a.nombre === 'Personal')!
  const alim = h.categorias.find((c) => c.nombre === 'Alimentación')!
  const almuerzo = h.subcategorias.find((x) => x.categoria_id === alim.id && x.nombre === 'Almuerzo')!
  const yape = h.medios_pago.find((m) => m.nombre === 'Yape')!
  return { personal, alim, almuerzo, yape }
}
let n = 0
const gasto = (r: ReturnType<typeof refs>, extra: Record<string, unknown> = {}) => ({
  id: `mov-test-${String(++n).padStart(6, '0')}`, fecha: '2026-10-15', monto: 10, moneda: 'PEN', ambito_id: r.personal.id, categoria_id: r.alim.id,
  subcategoria_id: r.almuerzo.id, medio_pago_id: r.yape.id, descripcion: 'menú del día', ...extra,
})

let backend: BackendDemo
beforeEach(async () => {
  localStorage.clear()
  useToasts.setState({ items: [] })
  backend = await crearBackendDemo({ almacen: almacenMemoria() })
})

describe('store de datos', () => {
  it('carga el bootstrap validado con Zod y deja el estado listo', async () => {
    const d = await dispositivo(backend)
    expect(d.estado().estado).toBe('listo')
    expect(d.estado().vista.ambitos).toHaveLength(5)
    expect(d.estado().descartadas).toBe(0)
    expect(d.estado().generacion).toBeTruthy()
  })

  it('actualiza la vista al instante (antes de que responda el servidor) y luego confirma', async () => {
    const d = await dispositivo(backend)
    const g = gasto(refs(d.estado()))
    const promesa = d.estado().mutar('movimiento.guardar', g)
    // Síncrono: la interfaz ya ve el gasto, normalizado, sin esperar a la red.
    expect(d.estado().vista.movimientos).toHaveLength(1)
    expect(d.estado().vista.movimientos[0]!.descripcion).toBe('Menú del Día')
    expect(d.estado().confirmado.movimientos).toHaveLength(0)
    expect(d.estado().pendientes).toHaveLength(1)
    const r = await promesa
    expect(r.ok).toBe(true)
    expect(d.estado().confirmado.movimientos).toHaveLength(1)
    expect(d.estado().pendientes).toHaveLength(0)
    expect(d.estado().vista.movimientos[0]!.version).toBe(1)
  })

  it('sin red conserva el gasto en la cola y lo envía al volver, sin duplicar', async () => {
    const d = await dispositivo(backend)
    d.ctl.modo = 'caido'
    const g = gasto(refs(d.estado()))
    void d.estado().mutar('movimiento.guardar', g)
    await vi.waitFor(() => expect(d.estado().enLinea).toBe(false))
    expect(d.estado().vista.movimientos).toHaveLength(1) // sigue visible
    expect(d.estado().pendientes).toHaveLength(1)
    d.ctl.modo = 'ok'
    await vi.waitFor(() => expect(d.estado().pendientes).toHaveLength(0))
    await vi.waitFor(() => expect(d.estado().confirmado.movimientos).toHaveLength(1))
    const filas = (await backend.enviar({ action: 'bootstrap', token: backend.token, payload: {} })) as { data: { hojas: { movimientos: unknown[] } } }
    expect(filas.data.hojas.movimientos).toHaveLength(1)
  })

  it('si el servidor aplicó la escritura pero se perdió la respuesta, el reintento no duplica', async () => {
    const d = await dispositivo(backend)
    d.ctl.modo = 'pierdeRespuesta'
    const g = gasto(refs(d.estado()))
    const r = await d.estado().mutar('movimiento.guardar', g)
    expect(r.ok).toBe(true)
    const envios = d.ctl.llamadas.filter((c) => c.action === 'movimiento.guardar')
    expect(envios.length).toBeGreaterThanOrEqual(2)
    expect(new Set(envios.map((e) => e.requestId)).size).toBe(1) // mismo requestId en cada reintento
    const b = (await backend.enviar({ action: 'bootstrap', token: backend.token, payload: {} })) as { data: { hojas: { movimientos: unknown[] } } }
    expect(b.data.hojas.movimientos).toHaveLength(1)
  })

  it('revierte lo optimista, registra el fallo y avisa cuando el servidor rechaza', async () => {
    const d = await dispositivo(backend)
    const r = await d.estado().mutar('movimiento.guardar', gasto(refs(d.estado()), { monto: -5 }))
    expect(r.ok).toBe(false)
    expect(d.estado().vista.movimientos).toHaveLength(0)
    expect(d.estado().fallos).toHaveLength(1)
    expect(d.estado().fallos[0]!.error.campo).toBe('monto')
    expect(useToasts.getState().items.some((t) => t.tipo === 'error')).toBe(true)
  })

  it('fusiona crear + editar mientras el alta sigue pendiente (un solo envío)', async () => {
    const d = await dispositivo(backend)
    const sinRed = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const g = gasto(refs(d.estado()))
    void d.estado().mutar('movimiento.guardar', g)
    await vi.waitFor(() => expect(d.estado().enLinea).toBe(false))
    void d.estado().mutar('movimiento.guardar', { ...g, monto: 99, version: 1 })
    expect(d.estado().pendientes).toHaveLength(1)
    expect(d.estado().vista.movimientos[0]!.monto).toBe(99)
    d.ctl.llamadas.length = 0
    sinRed.mockRestore()
    d.estado().reintentarAhora()
    await vi.waitFor(() => expect(d.estado().pendientes).toHaveLength(0))
    expect(d.ctl.llamadas.filter((c) => c.action === 'movimiento.guardar')).toHaveLength(1)
    const b = (await backend.enviar({ action: 'bootstrap', token: backend.token, payload: {} })) as { data: { hojas: { movimientos: Array<{ monto: number; version: number }> } } }
    expect(b.data.hojas.movimientos).toHaveLength(1)
    expect(b.data.hojas.movimientos[0]).toMatchObject({ monto: 99, version: 1 })
  })

  it('anular y restaurar se reflejan al instante y en orden', async () => {
    const d = await dispositivo(backend)
    const g = gasto(refs(d.estado()))
    await d.estado().mutar('movimiento.guardar', g)
    const p1 = d.estado().mutar('movimiento.anular', { id: g.id })
    expect(d.estado().vista.movimientos[0]!.estado).toBe('anulado')
    await p1
    const p2 = d.estado().mutar('movimiento.restaurar', { id: g.id })
    expect(d.estado().vista.movimientos[0]!.estado).toBe('activo')
    await p2
    expect(d.estado().confirmado.movimientos[0]!.estado).toBe('activo')
  })

  it('un conflicto de versión revierte y se vuelve a sincronizar con lo del otro dispositivo', async () => {
    const a = await dispositivo(backend)
    const b = await dispositivo(backend)
    const g = gasto(refs(a.estado()))
    await a.estado().mutar('movimiento.guardar', g)
    await b.estado().refrescar()
    await a.estado().mutar('movimiento.guardar', { ...g, monto: 50, version: 1 })
    const r = await b.estado().mutar('movimiento.guardar', { ...g, monto: 70, version: 1 })
    expect(r.ok).toBe(false)
    expect((r as { error: ApiError }).error.code).toBe('CONFLICT')
    await vi.waitFor(() => expect(b.estado().confirmado.movimientos[0]!.monto).toBe(50))
    expect(b.estado().vista.movimientos[0]!.monto).toBe(50)
  })

  it('sincroniza cambios y eliminaciones de otro dispositivo con la delta', async () => {
    const a = await dispositivo(backend)
    const b = await dispositivo(backend)
    const id = 'cat-test-000001'
    const personal = refs(a.estado()).personal
    expect((await a.estado().mutar('categoria.guardar', { id, nombre: 'Mascotas', vinculos: [{ ambito_id: personal.id }] })).ok).toBe(true)
    await b.estado().refrescar()
    expect(b.estado().vista.categorias.some((c) => c.id === id)).toBe(true)
    expect((await a.estado().mutar('categoria.eliminar', { id, confirmar: true, cascada: true })).ok).toBe(true)
    await b.estado().refrescar()
    expect(b.estado().vista.categorias.some((c) => c.id === id)).toBe(false)
  })

  it('la cola persistente sobrevive a un reinicio de la app', async () => {
    const almacen = colaMemoria()
    const a = await dispositivo(backend, almacen)
    a.ctl.modo = 'caido'
    const g = gasto(refs(a.estado()))
    void a.estado().mutar('movimiento.guardar', g)
    await vi.waitFor(() => expect(a.estado().enLinea).toBe(false))
    await a.cola.persistido()
    const guardados = await almacen.todos()
    expect(guardados).toHaveLength(1)
    expect(guardados[0]!.incierto).toBe(true) // salió y no se conoce el resultado
    // "Reinicio": nueva instancia con la misma cola persistida y red disponible
    const b = await dispositivo(backend, almacen)
    await vi.waitFor(() => expect(b.estado().pendientes).toHaveLength(0))
    await vi.waitFor(() => expect(b.estado().confirmado.movimientos).toHaveLength(1))
  })

  it('con un Code.gs incompatible no se envían escrituras: quedan guardadas esperando', async () => {
    const { ctl, transporte } = transporteDe(backend)
    const alterado: Transporte = {
      async enviar(p) {
        const r = (await transporte.enviar(p)) as { data?: Record<string, unknown> }
        if (p.action === 'bootstrap' && r.data) r.data['esquema'] = 2
        return r
      },
    }
    const cliente = crearCliente(() => ({ transporte: alterado, token: backend.token }))
    const d = crearDatos({ cliente, cola: new Cola(), sinInstantanea: true, esperaReintentoMs: () => 30 })
    await d.store.getState().iniciar()
    expect(d.store.getState().incompatible).toBe(true)
    expect(d.store.getState().error).toMatch(/esquema 2/)
    void d.store.getState().mutar('movimiento.guardar', gasto({ personal: { id: 'a' }, alim: { id: 'c' }, almuerzo: { id: 's' }, yape: { id: 'm' } } as never))
    await new Promise((r) => setTimeout(r, 80))
    expect(ctl.llamadas.filter((c) => c.action === 'movimiento.guardar')).toHaveLength(0)
    expect(d.store.getState().pendientes).toHaveLength(1)
  })

  it('un token inválido no descarta lo escrito: queda en la cola esperando', async () => {
    const d = await dispositivo(backend)
    const malo = crearCliente(() => ({ transporte: transporteDe(backend).transporte, token: 'malo' }))
    const e = crearDatos({ cliente: malo, cola: new Cola(), sinInstantanea: true, esperaReintentoMs: () => 5000 })
    void e.store.getState().mutar('movimiento.guardar', gasto(refs(d.estado())))
    await vi.waitFor(() => expect(e.store.getState().error).toMatch(/Token/))
    expect(e.store.getState().pendientes).toHaveLength(1)
    expect(e.store.getState().fallos).toHaveLength(0)
  })
})
