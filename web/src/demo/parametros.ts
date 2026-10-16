export type FallaDemo = 'timeout' | 'red' | 'busy' | null

export interface ParametrosDemo {
  /** Cantidad de movimientos deterministas a sembrar. */
  movimientos: number
  latenciaMs: number
  falla: FallaDemo
  /** Sin datos: solo el catálogo inicial. */
  vacio: boolean
}

/** ?demo[=400][&latencia=2000][&falla=timeout|red|busy][&vacio=1]. null = no es modo demo. */
export function leerParametrosDemo(search: string = typeof location === 'undefined' ? '' : location.search): ParametrosDemo | null {
  const q = new URLSearchParams(search)
  if (!q.has('demo')) return null
  const n = Number(q.get('demo'))
  const lat = Number(q.get('latencia'))
  const f = q.get('falla')
  return {
    movimientos: Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 20000) : 120,
    latenciaMs: Number.isFinite(lat) && lat > 0 ? Math.min(Math.floor(lat), 60000) : 0,
    falla: f === 'timeout' || f === 'red' || f === 'busy' ? f : null,
    vacio: q.get('vacio') === '1' || q.get('vacio') === 'true',
  }
}

/** URL actual sin los parámetros de demo (para "Salir de la demo"). */
export function urlSinDemo(href: string = location.href): string {
  const u = new URL(href)
  for (const k of ['demo', 'latencia', 'falla', 'vacio']) u.searchParams.delete(k)
  return u.pathname + (u.searchParams.size ? `?${u.searchParams}` : '') + u.hash
}
