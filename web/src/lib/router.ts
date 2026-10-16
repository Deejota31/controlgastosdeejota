import { useSyncExternalStore } from 'react'

export interface Ruta {
  path: string
  params: URLSearchParams
}

function leer(): Ruta {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path = '/', query = ''] = raw.split('?')
  return { path: path.startsWith('/') ? path : `/${path}`, params: new URLSearchParams(query) }
}

let cache: Ruta = typeof window === 'undefined' ? { path: '/', params: new URLSearchParams() } : leer()
let firma = ''

function suscribir(cb: () => void) {
  const handler = () => {
    const nueva = leer()
    const f = nueva.path + '?' + nueva.params.toString()
    if (f !== firma) {
      firma = f
      cache = nueva
    }
    cb()
  }
  window.addEventListener('hashchange', handler)
  return () => window.removeEventListener('hashchange', handler)
}

export function useRuta(): Ruta {
  return useSyncExternalStore(suscribir, () => cache, () => cache)
}

export function navegar(path: string, params?: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  if (params) for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  window.location.hash = s ? `${path}?${s}` : path
}
