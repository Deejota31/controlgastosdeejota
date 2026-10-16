import { create } from 'zustand'
import { transporteHttp, type Transporte } from '@/api/cliente'
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

export async function crearTransporteDemo(): Promise<{ transporte: Transporte; token: string }> {
  const { crearBackendDemo } = await import('@/demo/backend-demo')
  const d = await crearBackendDemo({ latenciaMs: 60 })
  return { transporte: { enviar: (p) => d.enviar(p) }, token: d.token }
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

const inicial = leerJson<Guardado>(CLAVE, { modo: 'sin-config', url: '', token: '' })

export const useConexion = create<ConexionState>((set, get) => ({
  ...inicial,
  listo: false,
  async usarDemo() {
    const d = await crearTransporteDemo()
    transporte = d.transporte
    tokenActivo = d.token
    guardarJson(CLAVE, { modo: 'demo', url: '', token: '' } satisfies Guardado)
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
    borrarClave(CLAVE)
    set({ modo: 'sin-config', url: '', token: '', listo: false })
  },
  async asegurar() {
    const s = get()
    if (s.listo && transporte) return true
    if (s.modo === 'demo') {
      await s.usarDemo()
      return true
    }
    if (s.modo === 'real' && s.url) {
      s.conectar(s.url, s.token)
      return true
    }
    return false
  },
}))
