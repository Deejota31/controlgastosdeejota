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
let firma = typeof window === 'undefined' ? '/?' : cache.path + '?' + cache.params.toString()

/** Instantánea estable: solo cambia de identidad cuando cambia la URL (también si cambió mientras nadie escuchaba). */
function instantanea(): Ruta {
  if (typeof window === 'undefined') return cache
  const nueva = leer()
  const f = nueva.path + '?' + nueva.params.toString()
  if (f !== firma) {
    firma = f
    cache = nueva
  }
  return cache
}

function suscribir(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRuta(): Ruta {
  return useSyncExternalStore(suscribir, instantanea, instantanea)
}

export function navegar(path: string, params?: Record<string, string | undefined>, opciones: { reemplazar?: boolean } = {}) {
  const q = new URLSearchParams()
  if (params) for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  const destino = s ? `${path}?${s}` : path
  if (opciones.reemplazar) {
    // replaceState no dispara hashchange: se avisa a mano para que los suscriptores relean la URL.
    window.history.replaceState(null, '', `#${destino}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else window.location.hash = destino
}
