export type CodigoError = 'AUTH' | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'BUSY' | 'QUOTA' | 'SCHEMA' | 'SERVER_ERROR' | 'RED' | 'TIEMPO'

const DEFINITIVOS: CodigoError[] = ['AUTH', 'VALIDATION', 'NOT_FOUND', 'CONFLICT', 'SCHEMA']

export class ApiError extends Error {
  readonly code: CodigoError
  readonly campo?: string
  readonly detalle?: unknown
  /** true si reintentar la misma petición no puede cambiar el resultado. */
  readonly definitivo: boolean
  constructor(code: CodigoError, message: string, campo?: string, detalle?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.campo = campo
    this.detalle = detalle
    this.definitivo = DEFINITIVOS.includes(code)
  }
}

export interface Peticion {
  action: string
  payload: Record<string, unknown>
  token: string
  requestId?: string
}

export interface Transporte {
  enviar(p: Peticion): Promise<unknown>
}

export interface RespuestaOk<T> {
  ok: true
  data: T
  generacion?: string
  repetido?: boolean
  ms?: number
}

export function nuevoRequestId(): string {
  return 'r' + crypto.randomUUID().replace(/-/g, '').slice(0, 30)
}
export function nuevoId(prefijo = 'id'): string {
  return `${prefijo}-${crypto.randomUUID()}`
}

/** Transporte HTTP hacia la Web App de Apps Script (text/plain evita el preflight de CORS). */
const ESTADOS_TRANSITORIOS = new Set([429, 500, 502, 503, 504])

export function transporteHttp(url: string, timeoutMs = 20_000): Transporte {
  return {
    async enviar(p) {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), timeoutMs)
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(p),
          redirect: 'follow',
          signal: ctl.signal,
        })
        if (ESTADOS_TRANSITORIOS.has(r.status)) throw new ApiError('SERVER_ERROR', `El servidor no pudo atender la petición (HTTP ${r.status}). Se reintentará.`)
        const texto = await r.text()
        try {
          return JSON.parse(texto) as unknown
        } catch {
          throw new ApiError('SCHEMA', 'La dirección no responde como Deejota Finanzas. Revisa que sea la URL de la aplicación web y que esté publicada para "Cualquier usuario".')
        }
      } catch (e) {
        if (e instanceof ApiError) throw e
        if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError('TIEMPO', 'El servidor tardó demasiado en responder.')
        throw new ApiError('RED', 'No hay conexión con el servidor.')
      } finally {
        clearTimeout(t)
      }
    },
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Reintentos con retroceso 1 s / 3 s / 7 s y ±20 % de variación para no sincronizar clientes. */
const ESCALA_REINTENTO = [1, 3, 7]
export function esperaReintento(intento: number, baseMs = 1000, azar: () => number = Math.random): number {
  const k = ESCALA_REINTENTO[Math.min(intento, ESCALA_REINTENTO.length) - 1] ?? 7
  return Math.round(baseMs * k * (0.8 + 0.4 * azar()))
}

export interface OpcionesLlamada {
  requestId?: string
  /** Reintentos automáticos ante errores transitorios (por defecto 3 en lecturas, 0 en escrituras). */
  reintentos?: number
  esperaBaseMs?: number
}

export interface Cliente {
  llamar<T = unknown>(action: string, payload?: Record<string, unknown>, op?: OpcionesLlamada): Promise<RespuestaOk<T>>
}

export function crearCliente(obtener: () => { transporte: Transporte; token: string } | null): Cliente {
  return {
    async llamar<T>(action: string, payload: Record<string, unknown> = {}, op: OpcionesLlamada = {}) {
      const conf = obtener()
      if (!conf) throw new ApiError('AUTH', 'Aún no conectaste tu hoja de cálculo.')
      const esEscritura = op.requestId !== undefined
      const maximo = op.reintentos ?? (esEscritura ? 0 : 3)
      let ultimo: ApiError | null = null
      for (let intento = 0; intento <= maximo; intento++) {
        if (intento > 0) await esperar(esperaReintento(intento, op.esperaBaseMs ?? 1000))
        try {
          const crudo = (await conf.transporte.enviar({ action, payload, token: conf.token, requestId: op.requestId })) as {
            ok?: boolean
            error?: { code?: string; message?: string; campo?: string; detalle?: unknown }
          } | null
          if (crudo && crudo.ok === true) return crudo as unknown as RespuestaOk<T>
          const e = crudo?.error
          if (!e) throw new ApiError('SCHEMA', 'Respuesta inesperada del servidor.')
          throw new ApiError((e.code as CodigoError) ?? 'SERVER_ERROR', e.message ?? 'Error del servidor.', e.campo, e.detalle)
        } catch (err) {
          const ae = err instanceof ApiError ? err : new ApiError('RED', 'No hay conexión con el servidor.')
          ultimo = ae
          if (ae.definitivo) throw ae
        }
      }
      throw ultimo ?? new ApiError('SERVER_ERROR', 'Error desconocido.')
    },
  }
}
