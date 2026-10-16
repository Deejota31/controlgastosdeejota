import { create } from 'zustand'
import { ApiError, crearCliente, nuevoRequestId, type Cliente } from '@/api/cliente'
import { verificarCompatibilidad } from '@/api/compat'
import { Cola, almacenIndexedDb, type ItemCola } from '@/api/cola'
import { coordinadorLocal, coordinadorWeb, type Coordinador, type Mensaje } from '@/api/coordinador'
import { idEntorno } from '@/lib/entorno'
import { leerParametrosDemo } from '@/demo/parametros'
import {
  CLAVE_HOJA, NOMBRES_HOJA, hojasVacias, validarHojas, type Hojas, type NombreHoja,
} from '@/api/esquemas'
import { aplicarPendientes } from '@/api/optimista'
import { borrarClave, borrarGrande, guardarGrande, leerGrande, leerJson } from '@/lib/almacen'
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
  /** Escrituras enviadas cuyo resultado no se conoce ("pendiente de confirmar"). */
  porConfirmar: number
  /** Se agotaron los reintentos automáticos: hace falta pulsar «Reintentar». */
  pausada: boolean
  /** false si el navegador no deja guardar la cola: lo pendiente se perdería al cerrar. */
  almacenLocalOk: boolean
  /** Identificador de la hoja conectada (separa colas y cachés); null en demo o sin conexión. */
  entorno: string | null
  /** El Code.gs desplegado no es compatible con esta app: no se envían escrituras. */
  incompatible: boolean
  iniciar: () => Promise<void>
  /** Carga los datos de un bootstrap ya pedido (el de la prueba de conexión) sin volver a pedirlo. */
  adoptarBootstrap: (datos: unknown) => void
  refrescar: () => Promise<void>
  mutar: <T = unknown>(action: string, payload: Record<string, unknown>) => Promise<ResultadoMutacion<T>>
  reintentarAhora: () => void
  descartarFallo: (requestId: string) => void
  /** Olvida los datos en memoria y la caché. Lo pendiente de enviar NO se borra salvo `descartarCola`. */
  reiniciar: (opc?: { descartarCola?: boolean }) => Promise<void>
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
const CLAVE_COLA_LEGADA = 'dj.cola.v1'
const MAX_PARALELO = 2
const MAX_FALLOS_AUTOMATICOS = 10
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
    } else {
      // Una lectura tardía no debe pisar una fila más nueva ya confirmada.
      const previa = out[i] as Record<string, unknown>
      const nueva = f as Record<string, unknown>
      if (typeof previa['version'] === 'number' && typeof nueva['version'] === 'number' && nueva['version'] < previa['version']) continue
      out[i] = f
    }
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
  /** Pruebas: coordinación entre pestañas ya creada. */
  coordinador?: Coordinador
}

export function crearDatos(deps: DepsDatos = {}) {
  const cliente = deps.cliente ?? crearCliente(configCliente)
  const cola = deps.cola ?? new Cola()
  const ahoraFn = deps.ahora ?? (() => new Date())
  // Retroceso exponencial con ±20 % de variación para que varios clientes no reintenten a la vez.
  const espera = deps.esperaReintentoMs ?? ((n: number) => Math.round(Math.min(60_000, 1000 * 2 ** Math.min(n, 6)) * (0.8 + 0.4 * Math.random())))
  const waiters = new Map<string, Array<(r: ResultadoMutacion) => void>>()
  let coord: Coordinador = deps.coordinador ?? coordinadorLocal()
  let activos = 0
  let enEspera = false
  let iniciando: Promise<void> | null = null
  let entornoActual: string | null | undefined
  let quitarOyentes: Array<() => void> = []
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

    const claveSnapshot = () => {
      const env = get().entorno
      return deps.sinInstantanea || (!env && !deps.cliente) ? null : `${CLAVE_SNAPSHOT}:${env ?? 'pruebas'}`
    }
    const programarGuardado = () => {
      if (claveSnapshot() === null) return
      clearTimeout(guardado)
      guardado = setTimeout(() => {
        const s = get()
        const snap: Instantanea = { v: 1, confirmado: s.confirmado, config: s.config, generacion: s.generacion, ultimoAhora: s.ultimoAhora, zona: s.zona }
        const k = claveSnapshot()
        if (k) void guardarGrande(k, snap)
      }, 400)
    }

    type DatosBootstrap = { hojas: unknown; config: Record<string, string>; generacion: string; ahora: string; zona_horaria?: string; esquema?: number; version_backend?: string }
    const aplicarBootstrap = (datos: DatosBootstrap) => {
      verificarCompatibilidad(datos) // si no es compatible no se habilitan escrituras
      const r = { data: datos }
      const { hojas, descartadas } = validarHojas(r.data.hojas)
      const confirmado: Hojas = { ...hojasVacias(), ...hojas }
      set({
        generacion: r.data.generacion, ultimoAhora: r.data.ahora, zona: r.data.zona_horaria ?? get().zona, descartadas,
        estado: 'listo', error: null, ultimaSync: Date.now(),
      })
      set({ incompatible: false })
      recalcular({ confirmado, config: r.data.config })
      programarGuardado()
    }
    const bootstrap = async () => {
      const r = await cliente.llamar<DatosBootstrap>('bootstrap', {})
      aplicarBootstrap(r.data)
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
        if (ae.code === 'SCHEMA') set({ incompatible: true })
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

    const pausar = (ms: number) => {
      enEspera = true
      clearTimeout(temporizador)
      temporizador = setTimeout(() => {
        enEspera = false
        procesar()
      }, ms)
    }

    const enviar = async (item: ItemCola) => {
      await cola.marcarEnVuelo(item.requestId) // se guarda ANTES de enviar: si la app muere, queda "por confirmar"
      try {
        const r = await cliente.llamar(item.action, item.payload, { requestId: item.requestId })
        cola.quitar(item.requestId)
        fallosSeguidos = 0
        aplicarRespuesta(r.data)
        recalcular()
        set({ enLinea: true, pausada: false })
        resolver(item.requestId, { ok: true, data: r.data })
        coord.difundir({ t: 'resultado', requestId: item.requestId, ok: true, data: r.data })
        if (!cola.largo) refrescarPronto()
      } catch (e) {
        const ae = e instanceof ApiError ? e : new ApiError('RED', 'No hay conexión con el servidor.')
        if (ae.code === 'AUTH' || ae.code === 'SCHEMA') {
          // No se pierde lo escrito: la escritura espera a que se corrija la conexión.
          cola.liberar(item.requestId, false)
          set({ enLinea: false, error: ae.message })
          fallosSeguidos = Math.max(fallosSeguidos, 5)
          pausar(espera(fallosSeguidos))
          return
        }
        if (ae.definitivo) {
          cola.quitar(item.requestId)
          const fallo: Fallo = { requestId: item.requestId, action: item.action, payload: item.payload, error: { code: ae.code, message: ae.message, campo: ae.campo }, cuando: Date.now() }
          set({ fallos: [fallo, ...get().fallos].slice(0, 20) })
          recalcular() // revierte lo optimista
          resolver(item.requestId, { ok: false, error: ae })
          coord.difundir({ t: 'resultado', requestId: item.requestId, ok: false, error: { code: ae.code, message: ae.message, campo: ae.campo } })
          toast.error(ae.code === 'CONFLICT' ? 'Otro dispositivo cambió este dato. Revisa y vuelve a intentarlo.' : ae.message)
          if (ae.code === 'CONFLICT') refrescarPronto()
          return
        }
        // Error transitorio: el servidor pudo haber aplicado la escritura (salvo que respondiera BUSY).
        // Se reintenta con el MISMO requestId; el servidor devuelve el resultado original sin repetirla.
        cola.liberar(item.requestId, ae.code !== 'BUSY')
        set({ enLinea: false })
        fallosSeguidos++
        if (fallosSeguidos >= MAX_FALLOS_AUTOMATICOS) set({ pausada: true })
        else pausar(espera(fallosSeguidos))
      }
    }

    /** Envía lo que esté listo: hasta 2 peticiones a la vez, nunca dos de la misma entidad ni antes que sus dependencias. */
    const procesar = () => {
      if (!coord.esLider || enEspera || get().pausada || get().incompatible) return
      // Sin red no se intenta: así lo pendiente sigue sin enviar (y se puede fusionar) hasta que vuelva.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        set({ enLinea: false })
        return
      }
      for (const item of cola.siguientes(MAX_PARALELO)) {
        activos++
        void enviar(item).finally(() => {
          activos--
          recalcular()
          procesar()
        })
      }
    }

    const alMensaje = (m: Mensaje) => {
      if (m.t === 'cola') {
        void cola.recargar(!coord.esLider).then(() => {
          recalcular()
          procesar()
        })
      } else if (!coord.esLider) {
        // Resultado informado por la pestaña líder: se actualiza la cola y la vista de esta pestaña y se resuelve su espera.
        if (m.ok) aplicarRespuesta(m.data)
        void cola.recargar(true).then(() => {
          recalcular()
          if (m.ok) resolver(m.requestId, { ok: true, data: m.data })
          else if (m.error) resolver(m.requestId, { ok: false, error: new ApiError(m.error.code as ApiError['code'], m.error.message, m.error.campo) })
          refrescarPronto()
        })
      }
    }

    const enlazarCoordinador = () => {
      quitarOyentes.forEach((f) => f())
      quitarOyentes = [
        coord.alRecibir(alMensaje),
        coord.alCambiarLiderazgo((lider) => {
          if (lider) void cola.recargar(false).then(() => { recalcular(); procesar() })
        }),
      ]
    }

    cola.alCambiarAlmacen = (ok) => {
      set({ almacenLocalOk: ok })
      if (!ok) toast.error('Este navegador no deja guardar los cambios pendientes. Si cierras la app antes de que se envíen, se perderán.')
    }
    if (deps.coordinador) enlazarCoordinador()

    /** Separa colas, cachés y coordinación entre pestañas por hoja conectada. */
    const usarEntorno = async () => {
      if (deps.cliente) return // pruebas: la cola y el coordinador vienen inyectados
      const c = useConexion.getState()
      const env = c.modo === 'real' && c.url ? idEntorno(c.url) : null
      if (entornoActual === env) return
      quitarOyentes.forEach((f) => f())
      quitarOyentes = []
      coord.cerrar()
      entornoActual = env
      if (env) {
        await cola.usarAlmacen(almacenIndexedDb(`dj-cola-${env}`))
        await migrarColaLegada()
        coord = coordinadorWeb(env)
        enlazarCoordinador()
      } else {
        await cola.usarAlmacen(null)
        coord = coordinadorLocal()
      }
      set({ entorno: env, almacenLocalOk: true })
    }

    /** Antes la cola vivía en localStorage sin separar por hoja: se adopta una sola vez en la hoja conectada. */
    const migrarColaLegada = async () => {
      const legada = leerJson<Array<Partial<ItemCola>>>(CLAVE_COLA_LEGADA, [])
      if (!legada.length) {
        borrarClave(CLAVE_COLA_LEGADA)
        return
      }
      for (const i of legada) {
        if (typeof i.requestId !== 'string' || typeof i.action !== 'string' || !i.payload) continue
        if (cola.items().some((x) => x.requestId === i.requestId)) continue
        const nuevo = cola.encolar({ requestId: i.requestId, action: i.action, payload: i.payload }, { fusionar: false })
        nuevo.incierto = i.enVuelo === true || (i.intentos ?? 0) > 0
      }
      if (await cola.persistido()) borrarClave(CLAVE_COLA_LEGADA)
    }

    cola.suscribir(() => {
      recalcular()
      set({ porConfirmar: cola.inciertos })
    })

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
      porConfirmar: cola.inciertos,
      pausada: false,
      almacenLocalOk: true,
      entorno: null,
      incompatible: false,
      adoptarBootstrap(datos) {
        aplicarBootstrap(datos as DatosBootstrap)
        set({ estado: 'listo' })
      },

      /** Una sola carga a la vez: quien llame mientras otra está en curso espera a esa misma. */
      iniciar() {
        iniciando ??= (async () => {
          if (!deps.cliente && !(await useConexion.getState().asegurar())) return
          await usarEntorno()
          set({ estado: get().estado === 'listo' ? 'listo' : 'cargando' })
          const k = claveSnapshot()
          if (k && !get().generacion) {
            const snap = await leerGrande<Instantanea>(k)
            if (snap && snap.v === 1) {
              set({ generacion: snap.generacion, ultimoAhora: snap.ultimoAhora, zona: snap.zona, estado: 'listo' })
              recalcular({ confirmado: snap.confirmado, config: snap.config })
            }
          }
          procesar()
          await refrescar()
        })().finally(() => {
          iniciando = null
        })
        return iniciando
      },
      refrescar,

      mutar<T>(action: string, payload: Record<string, unknown>) {
        // Solo la pestaña líder fusiona ediciones: una pestaña seguidora no sabe si la líder ya envió la anterior.
        const item = cola.encolar({ requestId: nuevoRequestId(), action, payload }, { fusionar: coord.esLider })
        return new Promise<ResultadoMutacion<T>>((resolve) => {
          const lista = waiters.get(item.requestId) ?? []
          lista.push(resolve as (r: ResultadoMutacion) => void)
          waiters.set(item.requestId, lista)
          recalcular() // la interfaz cambia en este mismo instante
          // Se avisa a las demás pestañas solo cuando ya quedó guardado localmente.
          void cola.persistido().then((ok) => {
            if (ok) coord.difundir({ t: 'cola' })
          })
          procesar()
        })
      },

      reintentarAhora() {
        fallosSeguidos = 0
        enEspera = false
        clearTimeout(temporizador)
        set({ pausada: false })
        procesar()
        void refrescar()
      },
      descartarFallo(requestId) {
        set({ fallos: get().fallos.filter((f) => f.requestId !== requestId) })
      },
      async reiniciar(opc = {}) {
        clearTimeout(temporizador)
        clearTimeout(guardado)
        clearTimeout(refrescoPendiente)
        enEspera = false
        const k = claveSnapshot()
        if (opc.descartarCola) cola.vaciar()
        else cola.soltar() // lo pendiente sigue guardado para esta hoja y se enviará si se vuelve a conectar
        await cola.persistido()
        entornoActual = undefined
        if (k) await borrarGrande(k)
        set({
          confirmado: hojasVacias(), vista: hojasVacias(), pendientes: [], config: {}, generacion: null, ultimoAhora: null,
          estado: 'inicial', error: null, fallos: [], descartadas: 0, ultimaSync: null, pausada: false, porConfirmar: 0, incompatible: false,
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
const enDemoUrl = leerParametrosDemo() !== null
/** En demo por URL todo vive en memoria: ni cola ni instantánea tocan los datos reales guardados. */
const app = crearDatos(enDemoUrl ? { cola: new Cola(), sinInstantanea: true } : {})
export const useDatos = app.store
export const colaApp = app.cola
export const conectarEventosDatos = app.conectarEventos
