import { diasEntre, mismoDiaHaceMeses } from './fechas'
import { aplicarFiltro, totales } from './movimientos'
import type { Filtro, MovC } from './tipos'

export interface Kpi {
  valor: number
  /** Valor del mismo tramo del mes anterior. */
  previo: number
  /** Variación relativa frente al mes anterior; null sin base. */
  variacion: number | null
}

export interface KpisMes {
  gastado: Kpi
  promedioDiario: Kpi
  ticketPromedio: Kpi
  mayorGasto: Kpi
  movimientos: Kpi
  diasTranscurridos: number
}

const kpi = (valor: number, previo: number): Kpi => ({ valor, previo, variacion: previo > 0 ? (valor - previo) / previo : null })

/**
 * KPIs del período [desde, hasta] contra el mismo tramo del mes anterior.
 * Los días transcurridos son inclusivos y salen de `hoy` (fecha viva): en el mes en curso el tramo termina hoy.
 */
export function calcularKpis(movs: readonly MovC[], filtro: Filtro, hoy: string): KpisMes {
  const hasta = filtro.hasta > hoy && filtro.desde <= hoy ? hoy : filtro.hasta
  const act: Filtro = { ...filtro, hasta }
  const prev: Filtro = { ...filtro, desde: mismoDiaHaceMeses(filtro.desde, 1), hasta: mismoDiaHaceMeses(hasta, 1) }
  const dias = Math.max(0, diasEntre(act.desde, act.hasta) + 1)
  const diasPrev = Math.max(0, diasEntre(prev.desde, prev.hasta) + 1)
  const a = totales(aplicarFiltro(movs, act))
  const p = totales(aplicarFiltro(movs, prev))
  return {
    gastado: kpi(a.total, p.total),
    promedioDiario: kpi(dias ? Math.round(a.total / dias) : 0, diasPrev ? Math.round(p.total / diasPrev) : 0),
    ticketPromedio: kpi(a.cantidad ? Math.round(a.total / a.cantidad) : 0, p.cantidad ? Math.round(p.total / p.cantidad) : 0),
    mayorGasto: kpi(a.mayor, p.mayor),
    movimientos: kpi(a.cantidad, p.cantidad),
    diasTranscurridos: dias,
  }
}

