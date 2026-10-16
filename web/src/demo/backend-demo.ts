import { crearServicios } from '@gas/gas-core.mjs'
import type { BackendGs } from 'virtual:code-gs'

/**
 * Modo demostración: ejecuta el Code.gs REAL contra un libro en memoria que se guarda en el
 * navegador. Así la demo, las pruebas y la producción comparten exactamente la misma lógica.
 */

export const CLAVE_DEMO = 'dj.demo.v1'
export const TOKEN_DEMO = 'demo-token-local'

interface Celda {
  $d: string
}
type Serial = {
  id: string
  hojas: Array<{ n: string; d: unknown[][]; f: Record<number, string>; m: number }>
  props: Record<string, string>
}

const aSigned = (buf: Uint8Array) => Array.from(buf, (b) => (b > 127 ? b - 256 : b))

function guardar(serv: ReturnType<typeof crearServicios>, almacen: Pick<Storage, 'setItem'>) {
  const s: Serial = {
    id: (serv.libro as unknown as { id: string }).id,
    hojas: serv.libro.hojas.map((h) => ({ n: h.nombre, d: h.datos, f: h.formatos, m: h.maxFilas })),
    props: Object.fromEntries(serv.props),
  }
  try {
    almacen.setItem(
      CLAVE_DEMO,
      JSON.stringify(s, (_k, v: unknown) => (v instanceof Date ? ({ $d: v.toISOString() } satisfies Celda) : v)),
    )
  } catch {
    /* sin espacio o sin almacenamiento: la demo sigue en memoria */
  }
}

function restaurar(serv: ReturnType<typeof crearServicios>, texto: string): boolean {
  try {
    const s = JSON.parse(texto, (_k, v: unknown) => (v && typeof v === 'object' && '$d' in v ? new Date((v as Celda).$d) : v)) as Serial
    const libro = serv.libro as unknown as { id: string; hojas: Array<Record<string, unknown>> }
    const libros = serv.libros as Map<string, unknown>
    libros.delete(libro.id)
    libro.id = s.id
    libros.set(s.id, libro)
    const Hoja = serv.Hoja as unknown as new (n: string, f: number) => Record<string, unknown>
    libro.hojas = s.hojas.map((h) => Object.assign(new Hoja(h.n, h.m), { datos: h.d, formatos: h.f, maxFilas: h.m }))
    serv.props.clear()
    Object.entries(s.props).forEach(([k, v]) => serv.props.set(k, v))
    return true
  } catch {
    return false
  }
}

export interface OpcionesDemo {
  almacen?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  tz?: string
  /** Latencia simulada por petición, para que el comportamiento optimista sea visible. */
  latenciaMs?: number
}

export interface BackendDemo {
  token: string
  enviar(peticion: unknown): Promise<unknown>
  reiniciar(): void
}

export async function crearBackendDemo(op: OpcionesDemo = {}): Promise<BackendDemo> {
  const { crearBackend } = await import('virtual:code-gs')
  const almacen = op.almacen ?? localStorage
  const tz = op.tz ?? 'America/Lima'
  const serv = crearServicios({
    tz,
    nuevaFecha: (s) => new Date(s),
    extras: {
      base64Encode: (x) => btoa(String.fromCharCode(...(typeof x === 'string' ? new TextEncoder().encode(x) : (x as number[]).map((b) => b & 255)))),
      base64Decode: (s) => aSigned(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
      Utilities: {
        newBlob: (d: unknown) => ({ getBytes: () => d }),
        // Sin gzip síncrono en el navegador: el backend trata la caché de bootstrap como opcional.
        gzip: () => {
          throw new Error('gzip no disponible en el navegador')
        },
        ungzip: () => {
          throw new Error('gzip no disponible en el navegador')
        },
        computeDigest: () => {
          throw new Error('El importador no está disponible en la demostración')
        },
      },
    },
  })
  const backend: BackendGs = crearBackend(serv)

  const previo = almacen.getItem(CLAVE_DEMO)
  if (!(previo && restaurar(serv, previo))) {
    backend.resetCtx()
    backend.setup()
    serv.props.set('TOKEN', TOKEN_DEMO)
    guardar(serv, almacen)
  }

  return {
    token: TOKEN_DEMO,
    async enviar(peticion) {
      if (op.latenciaMs) await new Promise((r) => setTimeout(r, op.latenciaMs))
      backend.resetCtx()
      const salida = backend.doPost({ postData: { contents: JSON.stringify(peticion) } })
      const resp = JSON.parse(salida.getContent()) as { ok?: boolean }
      if (resp.ok) guardar(serv, almacen)
      return resp
    },
    reiniciar() {
      almacen.removeItem(CLAVE_DEMO)
    },
  }
}
