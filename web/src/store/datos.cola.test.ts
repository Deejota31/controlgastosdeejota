import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crearBackendDemo, type BackendDemo } from '@/demo/backend-demo'
import { ApiError, crearCliente, type Transporte } from '@/api/cliente'
import { Cola, almacenMemoria, type Almacen } from '@/api/cola'
import type { Coordinador, Mensaje } from '@/api/coordinador'
import { crearDatos } from './datos'
import { useToasts } from './toasts'

const memoria = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

interface Control {
  modo: 'ok' | 'caido' | 'pierdeRespuesta'
  llamadas: Array<{ action: string; requestId?: string; id?: unknown }>
  enVuelo: number
  maximoEnVuelo: number
  retardoMs: number
}
function transporteDe(backend: BackendDemo, ctl: Control): Transporte {
  return {
    async enviar(p) {
      ctl.llamadas.push({ action: p.action, requestId: p.requestId, id: p.payload['id'] })
      if (ctl.modo === 'caido') throw new ApiError('RED', 'sin red')
      if (p.requestId) {
        ctl.enVuelo++
        ctl.maximoEnVuelo = Math.max(ctl.maximoEnVuelo, ctl.enVuelo)
      }
      try {
        if (ctl.retardoMs) await new Promise((r) => setTimeout(r, ctl.retardoMs))
        const r = await backend.enviar(p)
        if (ctl.modo === 'pierdeRespuesta') {
          ctl.modo = 'ok'
          throw new ApiError('TIEMPO', 'se perdió la respuesta')
        }
        return r
      } finally {
        if (p.requestId) ctl.enVuelo--
      }
    },
  }
}

async function dispositivo(backend: BackendDemo, opc: { almacen?: Almacen; coordinador?: Coordinador; espera?: number } = {}) {
  const ctl: Control = { modo: 'ok', llamadas: [], enVuelo: 0, maximoEnVuelo: 0, retardoMs: 0 }
  const cliente = crearCliente(() => ({ transporte: transporteDe(backend, ctl), token: backend.token }))
  const cola = new Cola()
  if (opc.almacen) await cola.usarAlmacen(opc.almacen)
  const d = crearDatos({ cliente, cola, sinInstantanea: true, esperaReintentoMs: () => opc.espera ?? 20, coordinador: opc.coordinador })
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
  id: `mov-cola-${String(++n).padStart(6, '0')}`, fecha: '2026-10-15', monto: 10, moneda: 'PEN', ambito_id: r.personal.id, categoria_id: r.alim.id,
  subcategoria_id: r.almuerzo.id, medio_pago_id: r.yape.id, descripcion: 'menú del día', ...extra,
})
const movimientosEnServidor = async (b: BackendDemo) =>
  ((await b.enviar({ action: 'bootstrap', token: b.token, payload: {} })) as { data: { hojas: { movimientos: Array<{ id: string }> } } }).data.hojas.movimientos

/** Dos pestañas conectadas: la 0 es la líder y la 1 la seguidora. */
function pestanas(): [Coordinador, Coordinador] {
  const oyentes = [new Set<(m: Mensaje) => void>(), new Set<(m: Mensaje) => void>()]
  const crear = (yo: 0 | 1): Coordinador => ({
    esLider: yo === 0,
    alCambiarLiderazgo: () => () => undefined,
    difundir: (m) => oyentes[1 - yo]!.forEach((f) => f(m)),
    alRecibir: (f) => {
      oyentes[yo]!.add(f)
      return () => void oyentes[yo]!.delete(f)
    },
    cerrar: () => undefined,
  })
  return [crear(0), crear(1)]
}

let backend: BackendDemo
beforeEach(async () => {
  localStorage.clear()
  useToasts.setState({ items: [] })
  backend = await crearBackendDemo({ almacen: memoria() })
})

describe('pendiente de confirmar', () => {
  it('si se pierde la respuesta, queda "por confirmar" con el mismo requestId y luego se confirma sin duplicar', async () => {
    const d = await dispositivo(backend, { espera: 150 })
    d.ctl.modo = 'pierdeRespuesta'
    const p = d.estado().mutar('movimiento.guardar', gasto(refs(d.estado())))
    await vi.waitFor(() => expect(d.estado().porConfirmar).toBe(1))
    expect(d.estado().vista.movimientos).toHaveLength(1) // sigue visible mientras se confirma
    const r = await p
    expect(r.ok).toBe(true)
    expect(d.estado().porConfirmar).toBe(0)
    expect(new Set(d.ctl.llamadas.filter((c) => c.action === 'movimiento.guardar').map((c) => c.requestId)).size).toBe(1)
    expect(await movimientosEnServidor(backend)).toHaveLength(1)
  })
  it('una edición hecha mientras algo está por confirmar no cambia lo ya enviado: sale después', async () => {
    const d = await dispositivo(backend, { espera: 150 })
    const g = gasto(refs(d.estado()))
    d.ctl.modo = 'pierdeRespuesta'
    const p1 = d.estado().mutar('movimiento.guardar', g)
    await vi.waitFor(() => expect(d.estado().porConfirmar).toBe(1))
    const p2 = d.estado().mutar('movimiento.guardar', { ...g, monto: 77, version: 1 })
    expect(d.estado().pendientes).toHaveLength(2)
    expect((await p1).ok && (await p2).ok).toBe(true)
    const envios = d.ctl.llamadas.filter((c) => c.action === 'movimiento.guardar')
    expect(new Set(envios.map((c) => c.requestId)).size).toBe(2)
    expect(d.estado().confirmado.movimientos[0]).toMatchObject({ monto: 77, version: 2 })
  })
  it('tras demasiados fallos seguidos se detiene hasta que la persona reintenta', async () => {
    const d = await dispositivo(backend, { espera: 1 })
    d.ctl.modo = 'caido'
    void d.estado().mutar('movimiento.guardar', gasto(refs(d.estado())))
    await vi.waitFor(() => expect(d.estado().pausada).toBe(true))
    const enviosAlPausar = d.ctl.llamadas.length
    await new Promise((r) => setTimeout(r, 40))
    expect(d.ctl.llamadas.length).toBe(enviosAlPausar) // no sigue insistiendo
    d.ctl.modo = 'ok'
    d.estado().reintentarAhora()
    await vi.waitFor(() => expect(d.estado().pendientes).toHaveLength(0))
    expect(d.estado().pausada).toBe(false)
    expect(await movimientosEnServidor(backend)).toHaveLength(1)
  })
})

describe('envío en paralelo y dependencias', () => {
  it('manda como máximo 2 peticiones a la vez', async () => {
    const d = await dispositivo(backend)
    d.ctl.retardoMs = 25
    const r = refs(d.estado())
    const todas = Array.from({ length: 6 }, () => d.estado().mutar('movimiento.guardar', gasto(r)))
    const res = await Promise.all(todas)
    expect(res.every((x) => x.ok)).toBe(true)
    expect(d.ctl.maximoEnVuelo).toBe(2)
    expect(await movimientosEnServidor(backend)).toHaveLength(6)
  })
  it('un gasto que usa una categoría aún no enviada espera a que la categoría llegue', async () => {
    const d = await dispositivo(backend)
    d.ctl.retardoMs = 20
    const r = refs(d.estado())
    const catId = 'cat-cola-000001'
    const pCat = d.estado().mutar('categoria.guardar', { id: catId, nombre: 'Mascotas', vinculos: [{ ambito_id: r.personal.id }] })
    const pMov = d.estado().mutar('movimiento.guardar', gasto(r, { categoria_id: catId, subcategoria_id: '' }))
    const [a, b] = await Promise.all([pCat, pMov])
    expect(a.ok).toBe(true)
    expect(b.ok, JSON.stringify(!b.ok && b.error.message)).toBe(true)
    const orden = d.ctl.llamadas.filter((c) => c.action === 'categoria.guardar' || c.action === 'movimiento.guardar').map((c) => c.action)
    expect(orden).toEqual(['categoria.guardar', 'movimiento.guardar'])
  })
  it('dos ediciones de la misma entidad nunca viajan juntas', async () => {
    const d = await dispositivo(backend)
    const g = gasto(refs(d.estado()))
    expect((await d.estado().mutar('movimiento.guardar', g)).ok).toBe(true)
    d.ctl.retardoMs = 25
    d.ctl.maximoEnVuelo = 0
    const p1 = d.estado().mutar('movimiento.anular', { id: g.id })
    const p2 = d.estado().mutar('movimiento.restaurar', { id: g.id })
    expect((await p1).ok && (await p2).ok).toBe(true)
    expect(d.ctl.maximoEnVuelo).toBe(1)
    expect(d.estado().confirmado.movimientos[0]!.estado).toBe('activo')
  })
})

describe('dos pestañas de la misma hoja', () => {
  it('solo la pestaña líder envía; la seguidora encola, guarda y recibe el resultado', async () => {
    const almacen = almacenMemoria()
    const [cLider, cSeg] = pestanas()
    const lider = await dispositivo(backend, { almacen, coordinador: cLider })
    const seguidora = await dispositivo(backend, { almacen, coordinador: cSeg })
    const p = seguidora.estado().mutar('movimiento.guardar', gasto(refs(seguidora.estado())))
    expect(seguidora.estado().vista.movimientos).toHaveLength(1)
    const r = await p
    expect(r.ok).toBe(true)
    expect(seguidora.ctl.llamadas.filter((c) => c.action === 'movimiento.guardar')).toHaveLength(0)
    expect(lider.ctl.llamadas.filter((c) => c.action === 'movimiento.guardar')).toHaveLength(1)
    expect(await movimientosEnServidor(backend)).toHaveLength(1)
    await vi.waitFor(() => expect(seguidora.estado().pendientes).toHaveLength(0))
    await vi.waitFor(() => expect(seguidora.estado().confirmado.movimientos).toHaveLength(1))
  })
  it('un rechazo definitivo llega a la pestaña que lo originó', async () => {
    const almacen = almacenMemoria()
    const [cLider, cSeg] = pestanas()
    await dispositivo(backend, { almacen, coordinador: cLider })
    const seguidora = await dispositivo(backend, { almacen, coordinador: cSeg })
    const r = await seguidora.estado().mutar('movimiento.guardar', gasto(refs(seguidora.estado()), { monto: -3 }))
    expect(r.ok).toBe(false)
    expect(seguidora.estado().vista.movimientos).toHaveLength(0)
  })
})

describe('proteger lo pendiente', () => {
  it('reiniciar (desconectar o cambiar de hoja) no borra lo pendiente: se envía al volver a esa hoja', async () => {
    const almacen = almacenMemoria()
    const a = await dispositivo(backend, { almacen, espera: 5000 })
    a.ctl.modo = 'caido'
    void a.estado().mutar('movimiento.guardar', gasto(refs(a.estado())))
    await vi.waitFor(() => expect(a.estado().enLinea).toBe(false))
    await a.estado().reiniciar()
    expect(a.estado().pendientes).toHaveLength(0) // la pantalla ya no lo muestra…
    expect(await almacen.todos()).toHaveLength(1) // …pero sigue guardado
    const b = await dispositivo(backend, { almacen })
    await vi.waitFor(() => expect(b.estado().pendientes).toHaveLength(0))
    expect(await movimientosEnServidor(backend)).toHaveLength(1)
  })
  it('descartar a propósito sí vacía la cola guardada', async () => {
    const almacen = almacenMemoria()
    const a = await dispositivo(backend, { almacen, espera: 5000 })
    a.ctl.modo = 'caido'
    void a.estado().mutar('movimiento.guardar', gasto(refs(a.estado())))
    await vi.waitFor(() => expect(a.estado().enLinea).toBe(false))
    await a.estado().reiniciar({ descartarCola: true })
    expect(await almacen.todos()).toHaveLength(0)
  })
  it('avisa si el navegador no deja guardar la cola', async () => {
    const roto: Almacen = { todos: async () => [], poner: async () => { throw new Error('Cuota') }, quitar: async () => undefined, limpiar: async () => undefined }
    const d = await dispositivo(backend, { almacen: roto })
    d.ctl.modo = 'caido'
    void d.estado().mutar('movimiento.guardar', gasto(refs(d.estado())))
    await vi.waitFor(() => expect(d.estado().almacenLocalOk).toBe(false))
    expect(useToasts.getState().items.some((t) => t.tipo === 'error' && /no deja guardar/.test(t.mensaje))).toBe(true)
  })
})
