import { create } from 'zustand'
import { ApiError, crearCliente, nuevoRequestId, type Cliente } from '@/api/cliente'
import { Cola, type ItemCola } from '@/api/cola'
import {
  CLAVE_HOJA, NOMBRES_HOJA, hojasVacias, validarHojas, type Hojas, type NombreHoja,
} from '@/api/esquemas'
import { aplicarPendientes } from '@/api/optimista'
import { borrarGrande, guardarGrande, leerGrande } from '@/lib/almacen'
import { toast } from '@/store/toasts'
import { configCliente, useConexion } from '@/store/conexion'

export type EstadoCarga = 'inicial' | 'cargando' | 'listo' | 'error'

export interface Fallo {
  requestId: string
  action: string
  payload: Record<string, unknown>
  error: { code: string; message: string; campo?: string }
  cuando: number
}

export type ResultadoMutacion<T = unknown> = { ok: true; data: T } | { ok: false; error: ApiError }

interface Instantanea {
  v: 1
  confirmado: Hojas
  config: Record<string, string>
  generacion: string | null
  ultimoAhora: string | null
  zona: string
}

export interface DatosState {
  confirmado: Hojas
  /** Lo que ve la interfaz: confirmado + escrituras pendientes aplicadas de forma optimista. */
  vista: Hojas
  pendientes: ItemCola[]
  config: Record<string, string>
  zona: string
  generacion: string | null
  ultimoAhora: string | null
  estado: EstadoCarga
  error: string | null
  sincronizando: boolean
  enLinea: boolean
  ultimaSync: number | null
  fallos: Fallo[]
  descartadas: number
  iniciar: () => Promise<void>
  refrescar: () => Promise<void>
  mutar: <T = unknown>(action: string, payload: Record<string, unknown>) => Promise<ResultadoMutacion<T>>
  reintentarAhora: () => void
  descartarFallo: (requestId: string) => void
  reiniciar: () => Promise<void>
}

/** Hojas cuya delta llega completa (no tienen fecha de cambio): se reemplazan enteras. */
const REEMPLAZO_COMPLETO: ReadonlySet<NombreHoja> = new Set(['ambito_categoria', 'ambito_subcategoria', 'fuente_medios', 'orden_movimientos'])

/** Clave de la respuesta de escritura → hoja a la que pertenece esa fila. */
const ENTIDAD_RESPUESTA: Record<string, NombreHoja> = {
  movimiento: 'movimientos', ambito: 'ambitos', categoria: 'categorias', subcategoria: 'subcategorias', medio: 'medios_pago',
  fuente: 'fuentes', fuente_mes: 'fuentes_mes', caja: 'cajas', caja_mes: 'cajas_mes', plantilla: 'plantillas',
  compromiso: 'compromisos', pago: 'compromiso_pagos', conciliacion: 'conciliaciones', grupo: 'grupos_fondos',
}

const CLAVE_SNAPSHOT = 'dj.snapshot.v1'
const SOLAPE_MS = 60_000

function upsertFilas<K extends NombreHoja>(actual: Hojas[K], nuevas: Hojas[K], clave: string): Hojas[K] {
  if (!nuevas.length) return actual
  const idx = new Map<unknown, number>()
  actual.forEach((f, i) => idx.set((f as Record<string, unknown>)[clave], i))
  const out = actual.slice()
  for (const f of nuevas) {
    const k = (f as Record<string, unknown>)[clave]
    const i = idx.get(k)
    if (i === undefined) {
      idx.set(k, out.length)
      out.push(f)
    } else out[i] = f
  }
  return out as Hojas[K]
}

function configDesdeFilas(base: Record<string, string>, filas: Hojas['config']): Record<string, string> {
  const c = { ...base }
  for (const f of filas) c[f.clave] = f.valor
  return c
}

export interface DepsDatos {
  cliente?: Cliente
  cola?: Cola
  /** Pruebas: desactiva la instantánea en IndexedDB. */
  sinInstantanea?: boolean
  ahora?: () => Date
  /** Espera antes de reintentar tras un error transitorio (ms por intento). */
  esperaReintentoMs?: (intento: number) => number
}

export function crearDatos(deps: DepsDatos = {}) {
  const cliente = deps.cliente ?? crearCliente(configCliente)
  const cola = deps.cola ?? new Cola()
  const ahoraFn = deps.ahora ?? (() => new Date())
  const espera = deps.esperaReintentoMs ?? ((n: number) => Math.min(60_000, 1000 * 2 ** Math.min(n, 6)))
  const waiters = new Map<string, Array<(r: ResultadoMutacion) => void>>()
  let procesando = false
  let temporizador: ReturnType<typeof setTimeout> | undefined
  let guardado: ReturnType<typeof setTimeout> | undefined
  let refrescoPendiente: ReturnType<typeof setTimeout> | undefined
  let fallosSeguidos = 0

  const store = create<DatosState>((set, get) => {
    const recalcular = (parcial: Partial<Pick<DatosState, 'confirmado' | 'config'>> = {}) => {
      const confirmado = parcial.confirmado ?? get().confirmado
      const config = parcial.config ?? get().config
      const pendientes = [...cola.items()]
      const vista = pendientes.length
        ? aplicarPendientes(confirmado, pendientes, { config, ahora: ahoraFn().toISOString() })
        : confirmado
      set({ confirmado, config, pendientes, vista })
    }

    const programarGuardado = () => {
      if (deps.sinInstantanea) return
      clearTimeout(guardado)
      guardado = setTimeout(() => {
        const s = get()
        const snap: Instantanea = { v: 1, confirmado: s.confirmado, config: s.config, generacion: s.generacion, ultimoAhora: s.ultimoAhora, zona: s.zona }
        void guardarGrande(CLAVE_SNAPSHOT, snap)
      }, 400)
    }

    const bootstrap = async () => {
      const r = await cliente.llamar<{ hojas: unknown; config: Record<string, string>; generacion: string; ahora: string; zona_horaria?: string }>('bootstrap', {})
      const { hojas, descartadas } = validarHojas(r.data.hojas)
      const confirmado: Hojas = { ...hojasVacias(), ...hojas }
      set({
        generacion: r.data.generacion, ultimoAhora: r.data.ahora, zona: r.data.zona_horaria ?? get().zona, descartadas,
        estado: 'listo', error: null, ultimaSync: Date.now(),
      })
      recalcular({ confirmado, config: r.data.config })
      programarGuardado()
    }

    const aplicarDelta = (d: { hojas?: unknown; eliminados?: Array<{ entidad: string; entidad_id: string }>; generacion: string; ahora: string }) => {
      const { hojas, descartadas } = validarHojas(d.hojas)
      let confirmado = { ...get().confirmado } as Record<string, unknown[]>
      let config = get().config
      for (const n of NOMBRES_HOJA) {
        const nuevas = (hojas as Record<string, unknown[]>)[n]
        if (!nuevas) continue
        confirmado[n] = REEMPLAZO_COMPLETO.has(n) ? nuevas : upsertFilas(confirmado[n] as never, nuevas as never, CLAVE_HOJA[n])
        if (n === 'config') config = configDesdeFilas(config, nuevas as Hojas['config'])
      }
      for (const e of d.eliminados ?? []) {
        const n = e.entidad as NombreHoja
        if (!(n in CLAVE_HOJA) || REEMPLAZO_COMPLETO.has(n)) continue
        const clave = CLAVE_HOJA[n]
        confirmado[n] = (confirmado[n] ?? []).filter((f) => (f as Record<string, unknown>)[clave] !== e.entidad_id)
      }
      confirmado = { ...confirmado }
      set({ generacion: d.generacion, ultimoAhora: d.ahora, descartadas: get().descartadas + descartadas, ultimaSync: Date.now(), error: null })
      recalcular({ confirmado: confirmado as unknown as Hojas, config })
      programarGuardado()
    }

    const refrescar = async () => {
      if (get().sincronizando) return
      set({ sincronizando: true })
      try {
        const s = get()
        if (!s.generacion || !s.ultimoAhora) await bootstrap()
        else {
          const desde = new Date(Date.parse(s.ultimoAhora) - SOLAPE_MS).toISOString()
          const r = await cliente.llamar<{ sin_cambios?: boolean; completo?: boolean; generacion: string; ahora: string; hojas?: unknown; eliminados?: Array<{ entidad: string; entidad_id: string }> }>('cambios', { generacion: s.generacion, desde })
          if (r.data.sin_cambios) set({ ultimaSync: Date.now(), ultimoAhora: r.data.ahora, error: null })
          else if (r.data.completo) await bootstrap()
          else aplicarDelta(r.data)
        }
        set({ enLinea: true })
      } catch (e) {
        const ae = e instanceof ApiError ? e : new ApiError('RED', 'No hay conexión con el servidor.')
        set({ enLinea: ae.code !== 'RED' && ae.code !== 'TIEMPO', error: get().estado === 'listo' ? null : ae.message, estado: get().estado === 'listo' ? 'listo' : 'error' })
        if (ae.code === 'AUTH' || ae.code === 'SCHEMA') set({ error: ae.message })
      } finally {
        set({ sincronizando: false })
      }
    }

    const refrescarPronto = () => {
      clearTimeout(refrescoPendiente)
      refrescoPendiente = setTimeout(() => void refrescar(), 250)
    }

    const aplicarRespuesta = (data: unknown) => {
      if (!data || typeof data !== 'object') return
      const d = data as Record<string, unknown>
      let confirmado = get().confirmado as unknown as Record<string, unknown[]>
      let cambio = false
      for (const [k, hojaN] of Object.entries(ENTIDAD_RESPUESTA)) {
        const fila = d[k]
        if (!fila || typeof fila !== 'object' || Array.isArray(fila)) continue
        const r = validarHojas({ [hojaN]: [fila] })
        const ok = (r.hojas as Record<string, unknown[]>)[hojaN]
        if (!ok?.length) continue
        confirmado = { ...confirmado, [hojaN]: upsertFilas(confirmado[hojaN] as never, ok as never, CLAVE_HOJA[hojaN]) }
        cambio = true
      }
      if (cambio) {
        recalcular({ confirmado: confirmado as unknown as Hojas })
        programarGuardado()
      }
    }

    const resolver = (requestId: string, r: ResultadoMutacion) => {
      const w = waiters.get(requestId)
      waiters.delete(requestId)
      w?.forEach((f) => f(r))
    }

    const procesar = async () => {
      if (procesando) return
      procesando = true
      clearTimeout(temporizador)
      try {
        for (;;) {
          const item = cola.items().find((i) => !i.enVuelo)
          if (!item) break
          cola.marcarEnVuelo(item.requestId, true)
          try {
            const r = await cliente.llamar(item.action, item.payload, { requestId: item.requestId })
            cola.quitar(item.requestId)
            fallosSeguidos = 0
            aplicarRespuesta(r.data)
            recalcular()
            set({ enLinea: true })
            resolver(item.requestId, { ok: true, data: r.data })
            if (!cola.largo) refrescarPronto()
          } catch (e) {
            const ae = e instanceof ApiError ? e : new ApiError('RED', 'No hay conexión con el servidor.')
            if (ae.code === 'AUTH' || ae.code === 'SCHEMA') {
              // No se pierde lo escrito: la escritura espera a que se corrija la conexión.
              cola.marcarEnVuelo(item.requestId, false)
              set({ enLinea: false, error: ae.message })
              fallosSeguidos = Math.max(fallosSeguidos, 5)
              temporizador = setTimeout(() => void procesar(), espera(fallosSeguidos))
              break
            }
            if (ae.definitivo) {
              cola.quitar(item.requestId)
              const fallo: Fallo = { requestId: item.requestId, action: item.action, payload: item.payload, error: { code: ae.code, message: ae.message, campo: ae.campo }, cuando: Date.now() }
              set({ fallos: [fallo, ...get().fallos].slice(0, 20) })
              recalcular() // revierte lo optimista
              resolver(item.requestId, { ok: false, error: ae })
              toast.error(ae.code === 'CONFLICT' ? 'Otro dispositivo cambió este dato. Revisa y vuelve a intentarlo.' : ae.message)
              if (ae.code === 'CONFLICT') refrescarPronto()
            } else {
              cola.marcarEnVuelo(item.requestId, false)
              set({ enLinea: false })
              fallosSeguidos++
              temporizador = setTimeout(() => void procesar(), espera(fallosSeguidos))
              break
            }
          }
        }
      } finally {
        procesando = false
        recalcular()
      }
    }

    cola.suscribir(() => recalcular())

    return {
      confirmado: hojasVacias(),
      vista: hojasVacias(),
      pendientes: [...cola.items()],
      config: {},
      zona: 'America/Lima',
      generacion: null,
      ultimoAhora: null,
      estado: 'inicial',
      error: null,
      sincronizando: false,
      enLinea: typeof navigator === 'undefined' ? true : navigator.onLine,
      ultimaSync: null,
      fallos: [],
      descartadas: 0,

      async iniciar() {
        if (get().estado === 'cargando') return
        if (!deps.cliente && !(await useConexion.getState().asegurar())) return
        set({ estado: get().estado === 'listo' ? 'listo' : 'cargando' })
        if (!deps.sinInstantanea && !get().generacion) {
          const snap = await leerGrande<Instantanea>(CLAVE_SNAPSHOT)
          if (snap && snap.v === 1) {
            set({ generacion: snap.generacion, ultimoAhora: snap.ultimoAhora, zona: snap.zona, estado: 'listo' })
            recalcular({ confirmado: snap.confirmado, config: snap.config })
          }
        }
        void procesar()
        await refrescar()
      },
      refrescar,

      mutar<T>(action: string, payload: Record<string, unknown>) {
        const item = cola.encolar({ requestId: nuevoRequestId(), action, payload })
        return new Promise<ResultadoMutacion<T>>((resolve) => {
          const lista = waiters.get(item.requestId) ?? []
          lista.push(resolve as (r: ResultadoMutacion) => void)
          waiters.set(item.requestId, lista)
          recalcular() // la interfaz cambia en este mismo instante
          void procesar()
        })
      },

      reintentarAhora() {
        fallosSeguidos = 0
        void procesar()
        void refrescar()
      },
      descartarFallo(requestId) {
        set({ fallos: get().fallos.filter((f) => f.requestId !== requestId) })
      },
      async reiniciar() {
        clearTimeout(temporizador)
        clearTimeout(guardado)
        clearTimeout(refrescoPendiente)
        cola.vaciar()
        if (!deps.sinInstantanea) await borrarGrande(CLAVE_SNAPSHOT)
        set({
          confirmado: hojasVacias(), vista: hojasVacias(), pendientes: [], config: {}, generacion: null, ultimoAhora: null,
          estado: 'inicial', error: null, fallos: [], descartadas: 0, ultimaSync: null,
        })
      },
    }
  })

  const alVolverLaRed = () => {
    store.setState({ enLinea: true })
    store.getState().reintentarAhora()
  }
  const alPerderLaRed = () => store.setState({ enLinea: false })
  const conectarEventos = () => {
    window.addEventListener('online', alVolverLaRed)
    window.addEventListener('offline', alPerderLaRed)
    return () => {
      window.removeEventListener('online', alVolverLaRed)
      window.removeEventListener('offline', alPerderLaRed)
    }
  }

  return { store, cola, conectarEventos }
}

/** Instancia de la aplicación. */
const app = crearDatos()
export const useDatos = app.store
export const colaApp = app.cola
export const conectarEventosDatos = app.conectarEventos
