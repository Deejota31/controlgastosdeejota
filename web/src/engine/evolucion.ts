import { mismoDiaHaceMeses } from './fechas'
import { agruparPor, aplicarFiltro, cuenta } from './movimientos'
import type { Filtro, MovC } from './tipos'

export type Dimension = 'ambito' | 'categoria' | 'subcategoria'

export interface FilaEvolucion {
  id: string
  actual: number
  previo: number
  /** actual − previo (céntimos). */
  delta: number
  /** Variación relativa; null cuando no hay base ("Nuevo"). */
  pct: number | null
  nuevo: boolean
}

export interface Evolucion {
  /** Mismo tramo, `meses` atrás. */
  tramoPrevio: { desde: string; hasta: string }
  filas: FilaEvolucion[]
  subidas: FilaEvolucion[]
  bajadas: FilaEvolucion[]
  totalActual: number
  totalPrevio: number
}

const clave = (d: Dimension) => (m: MovC) => (d === 'ambito' ? m.ambito : d === 'categoria' ? m.categoria : m.sub)

/** Compara el tramo [desde, hasta] con el mismo tramo 1 o 2 meses antes (mismo día del mes). */
export function calcularEvolucion(movs: readonly MovC[], filtro: Filtro, dimension: Dimension, mesesAtras: 1 | 2, limite = 10): Evolucion {
  const prevFiltro: Filtro = { ...filtro, desde: mismoDiaHaceMeses(filtro.desde, mesesAtras), hasta: mismoDiaHaceMeses(filtro.hasta, mesesAtras) }
  const act = agruparPor(aplicarFiltro(movs, filtro), clave(dimension))
  const prev = agruparPor(aplicarFiltro(movs, prevFiltro), clave(dimension))
  const mapaPrev = new Map(prev.map((g) => [g.id, g.total]))
  const ids = new Set([...act.map((g) => g.id), ...prev.map((g) => g.id)])
  const mapaAct = new Map(act.map((g) => [g.id, g.total]))
  const filas: FilaEvolucion[] = []
  for (const id of ids) {
    if (!id) continue
    const a = mapaAct.get(id) ?? 0
    const p = mapaPrev.get(id) ?? 0
    filas.push({ id, actual: a, previo: p, delta: a - p, pct: p > 0 ? (a - p) / p : null, nuevo: p === 0 && a > 0 })
  }
  filas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || (x.id < y.id ? -1 : 1))
  const subidas = filas.filter((f) => f.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, limite)
  const bajadas = filas.filter((f) => f.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, limite)
  return {
    tramoPrevio: { desde: prevFiltro.desde, hasta: prevFiltro.hasta },
    filas, subidas, bajadas,
    totalActual: act.reduce((s, g) => s + g.total, 0),
    totalPrevio: prev.reduce((s, g) => s + g.total, 0),
  }
}

/** Ahorro potencial = % configurable sobre los gastos variables del período. */
export function ahorroPotencial(movs: readonly MovC[], filtro: Filtro, pctAhorro: number): { baseVariable: number; ahorro: number } {
  let base = 0
  for (const m of aplicarFiltro(movs, filtro)) if (cuenta(m) && m.tipo === 'variable') base += m.cents
  return { baseVariable: base, ahorro: Math.round((base * pctAhorro) / 100) }
}
