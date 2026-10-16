/**
 * Coordinación entre pestañas de la misma hoja: solo una (la líder) envía la cola al servidor.
 * Usa Web Locks para elegir líder y BroadcastChannel para avisar de cambios. Si el navegador no los ofrece,
 * la pestaña actúa como líder única.
 */
export type Mensaje =
  | { t: 'cola' }
  | { t: 'resultado'; requestId: string; ok: boolean; data?: unknown; error?: { code: string; message: string; campo?: string } }

export interface Coordinador {
  readonly esLider: boolean
  alCambiarLiderazgo(fn: (lider: boolean) => void): () => void
  difundir(m: Mensaje): void
  alRecibir(fn: (m: Mensaje) => void): () => void
  cerrar(): void
}

export function coordinadorLocal(): Coordinador {
  return {
    esLider: true,
    alCambiarLiderazgo: () => () => undefined,
    difundir: () => undefined,
    alRecibir: () => () => undefined,
    cerrar: () => undefined,
  }
}

export function coordinadorWeb(entorno: string): Coordinador {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  if (!nav?.locks || typeof BroadcastChannel === 'undefined') return coordinadorLocal()
  let lider = false
  let cerrado = false
  let soltar: (() => void) | null = null
  const oyentesLider = new Set<(l: boolean) => void>()
  const oyentesMsg = new Set<(m: Mensaje) => void>()
  const canal = new BroadcastChannel(`dj-${entorno}`)
  canal.onmessage = (ev: MessageEvent<Mensaje>) => oyentesMsg.forEach((f) => f(ev.data))
  void nav.locks
    .request(`dj-lider-${entorno}`, () => {
      if (cerrado) return undefined
      lider = true
      oyentesLider.forEach((f) => f(true))
      return new Promise<void>((resolve) => {
        soltar = resolve
      })
    })
    .catch(() => {
      // Sin bloqueos utilizables: esta pestaña procesa sola.
      lider = true
      oyentesLider.forEach((f) => f(true))
    })
  return {
    get esLider() {
      return lider
    },
    alCambiarLiderazgo(fn) {
      oyentesLider.add(fn)
      return () => void oyentesLider.delete(fn)
    },
    difundir: (m) => canal.postMessage(m),
    alRecibir(fn) {
      oyentesMsg.add(fn)
      return () => void oyentesMsg.delete(fn)
    },
    cerrar() {
      cerrado = true
      lider = false
      soltar?.()
      canal.close()
    },
  }
}
