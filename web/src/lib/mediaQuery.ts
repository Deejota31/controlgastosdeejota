import { useSyncExternalStore } from 'react'

/** Escucha una media query. Sin matchMedia (pruebas antiguas) devuelve `porDefecto`. */
export function useMediaQuery(query: string, porDefecto = false): boolean {
  const suscribir = (cb: () => void) => {
    if (typeof matchMedia === 'undefined') return () => undefined
    const m = matchMedia(query)
    m.addEventListener('change', cb)
    return () => m.removeEventListener('change', cb)
  }
  return useSyncExternalStore(
    suscribir,
    () => (typeof matchMedia === 'undefined' ? porDefecto : matchMedia(query).matches),
    () => porDefecto,
  )
}
