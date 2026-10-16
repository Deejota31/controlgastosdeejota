import { create } from 'zustand'
import { ApiError, crearCliente, nuevoRequestId, transporteHttp, type Transporte } from '@/api/cliente'
import { validarUrlWebApp } from '@/api/url'
import { leerParametrosDemo, type ParametrosDemo } from '@/demo/parametros'
import { borrarClave, guardarJson, leerJson } from '@/lib/almacen'

export type ModoConexion = 'sin-config' | 'demo' | 'real'

interface Guardado {
  modo: ModoConexion
  url: string
  token: string
}
const CLAVE = 'dj.conexion.v1'

interface ConexionState extends Guardado {
  /** El transporte está creado y se puede llamar. */
  listo: boolean
  usarDemo: () => Promise<void>
  conectar: (url: string, token: string) => void
  desconectar: () => void
  asegurar: () => Promise<boolean>
}

let transporte: Transporte | null = null
let tokenActivo = ''
let demoEnCurso: Promise<void> | null = null

/** Almacén en memoria: la demo por URL jamás escribe en el almacenamiento del navegador. */
function almacenMemoria(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

/**
 * Transporte de demostración. Con parámetros de URL (?demo…) es determinista y en memoria; sin ellos
 * conserva el libro en el navegador. `falla` simula problemas: `red` (nada llega al servidor),
 * `timeout` (el servidor aplica el cambio pero la respuesta se pierde) y `busy` (servidor ocupado).
 */
export async function crearTransporteDemo(pd: ParametrosDemo | null = null): Promise<{ transporte: Transporte; token: string }> {
  const { crearBackendDemo } = await import('@/demo/backend-demo')
  const d = await crearBackendDemo({ latenciaMs: pd ? pd.latenciaMs : 60, almacen: pd ? almacenMemoria() : undefined })
  if (pd && !pd.vacio) {
    const { sembrarDemo } = await import('@/demo/semilla')
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
    await sembrarDemo((action, payload) => d.enviar({ action, payload, token: d.token, requestId: nuevoRequestId() }) as never, hoy, pd.movimientos)
  }
  let n = 0
  return {
    token: d.token,
    transporte: {
      async enviar(p) {
        const esEscritura = p.requestId !== undefined
        if (pd?.falla && esEscritura && p.action !== 'bootstrap') {
          n++
          if (n % 2 === 1) {
            if (pd.falla === 'red') throw new ApiError('RED', 'No hay conexión con el servidor.')
            if (pd.falla === 'busy') return { ok: false, error: { code: 'BUSY', message: 'El servidor está ocupado. Reintentando.' } }
            if (pd.falla === 'timeout') {
              await d.enviar(p) // el servidor sí lo aplicó…
              throw new ApiError('TIEMPO', 'El servidor tardó demasiado en responder.') // …pero la respuesta se perdió
            }
          }
        }
        return d.enviar(p)
      },
    },
  }
}

export { validarUrlWebApp }

export interface ResultadoPrueba {
  version: string
  ms: number
  hojas: number
  zona: string
}

/** Prueba la conexión SIN guardarla: pide el bootstrap y mide la latencia. Lanza ApiError si falla. */
export async function probarConexion(url: string, token: string, timeoutMs = 20_000): Promise<ResultadoPrueba> {
  const e = validarUrlWebApp(url)
  if (e) throw new ApiError('VALIDATION', e, 'url')
  if (!token.trim()) throw new ApiError('VALIDATION', 'Pega el token de acceso.', 'token')
  const cliente = crearCliente(() => ({ transporte: transporteHttp(url.trim(), timeoutMs), token: token.trim() }))
  const t0 = performance.now()
  const r = await cliente.llamar<{ hojas?: Record<string, unknown[]>; zona_horaria?: string }>('bootstrap', {}, { reintentos: 0 })
  return {
    version: r.version ?? '—',
    ms: Math.round(performance.now() - t0),
    hojas: Object.keys(r.data.hojas ?? {}).length,
    zona: r.data.zona_horaria ?? 'America/Lima',
  }
}

/** Datos para el cliente API: transporte y token vigentes (o null si falta conectar). */
export function configCliente(): { transporte: Transporte; token: string } | null {
  return transporte ? { transporte, token: tokenActivo } : null
}

/** Para pruebas: inyecta un transporte ya creado. */
export function fijarTransporte(t: Transporte | null, token = '') {
  transporte = t
  tokenActivo = token
  useConexion.setState({ listo: t !== null })
}

const paramsDemo = leerParametrosDemo()
/** Con ?demo en la URL se ignora (y nunca se modifica) la conexión real guardada. */
const inicial: Guardado = paramsDemo ? { modo: 'demo', url: '', token: '' } : leerJson<Guardado>(CLAVE, { modo: 'sin-config', url: '', token: '' })

export const useConexion = create<ConexionState>((set, get) => ({
  ...inicial,
  listo: false,
  async usarDemo() {
    const d = await crearTransporteDemo(paramsDemo)
    transporte = d.transporte
    tokenActivo = d.token
    if (!paramsDemo) guardarJson(CLAVE, { modo: 'demo', url: '', token: '' } satisfies Guardado)
    set({ modo: 'demo', url: '', token: '', listo: true })
  },
  conectar(url, token) {
    const limpia = url.trim()
    transporte = transporteHttp(limpia)
    tokenActivo = token.trim()
    guardarJson(CLAVE, { modo: 'real', url: limpia, token: token.trim() } satisfies Guardado)
    set({ modo: 'real', url: limpia, token: token.trim(), listo: true })
  },
  desconectar() {
    transporte = null
    tokenActivo = ''
    if (!paramsDemo) {
      borrarClave(CLAVE)
      borrarClave('dj.demo.v1')
    }
    set({ modo: 'sin-config', url: '', token: '', listo: false })
  },
  async asegurar() {
    const s = get()
    if (s.listo && transporte) return true
    if (s.modo === 'demo') {
      if (!demoEnCurso) demoEnCurso = s.usarDemo().finally(() => (demoEnCurso = null))
      await demoEnCurso
      return true
    }
    if (s.modo === 'real' && s.url) {
      s.conectar(s.url, s.token)
      return true
    }
    return false
  },
}))
