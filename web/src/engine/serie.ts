import { diaDe, diasEnMes, diasTranscurridos, estadoDelMes, sumarDias } from './fechas'
import { cuenta } from './movimientos'
import type { MovC } from './tipos'

export interface PuntoSerie {
  fecha: string
  dia: number
  /** Gasto del día (céntimos). */
  gasto: number
  /** Gasto acumulado real; null en días futuros. */
  real: number | null
  /** Ritmo ideal: presupuesto repartido de forma pareja. null sin presupuesto. */
  ideal: number | null
  /** Proyección de cierre (solo mes en curso, desde hoy). */
  proyeccion: number | null
}

export interface SerieMes {
  mes: string
  dias: number
  transcurridos: number
  enCurso: boolean
  puntos: PuntoSerie[]
  gastado: number
  /** Gasto por día transcurrido. */
  promedioDiario: number
  /** Cierre proyectado al ritmo actual; null si el mes no está en curso. */
  proyeccionCierre: number | null
  presupuesto: number
}

/**
 * Serie diaria de un mes: gasto acumulado real, ritmo ideal y proyección de cierre (solo si el mes está en curso).
 * Los días transcurridos son inclusivos y salen de `hoy` (fecha viva).
 */
export function serieDiariaMes(movs: readonly MovC[], mes: string, hoy: string, presupuesto: number): SerieMes {
  const n = diasEnMes(mes)
  const transcurridos = diasTranscurridos(mes, hoy)
  const estado = estadoDelMes(mes, hoy)
  const porDia = new Array<number>(n + 1).fill(0)
  let gastado = 0
  for (const m of movs) {
    if (m.mes !== mes || !cuenta(m)) continue
    porDia[diaDe(m.fecha)]! += m.cents
    gastado += m.cents
  }
  const promedioDiario = transcurridos > 0 ? Math.round(gastado / transcurridos) : 0
  const proyeccionCierre = estado === 'en_curso' && transcurridos > 0 ? Math.round((gastado / transcurridos) * n) : null
  const puntos: PuntoSerie[] = []
  let acum = 0
  let acumHoy = 0
  for (let d = 1; d <= n; d++) {
    acum += porDia[d]!
    const visible = d <= transcurridos
    if (d === transcurridos) acumHoy = acum
    puntos.push({
      fecha: `${mes}-${String(d).padStart(2, '0')}`,
      dia: d,
      gasto: porDia[d]!,
      real: visible ? acum : null,
      ideal: presupuesto > 0 ? Math.round((presupuesto * d) / n) : null,
      proyeccion: null,
    })
  }
  if (proyeccionCierre !== null) {
    for (let d = transcurridos; d <= n; d++) {
      puntos[d - 1]!.proyeccion = d === transcurridos ? acumHoy : Math.round(acumHoy + ((proyeccionCierre - acumHoy) * (d - transcurridos)) / (n - transcurridos))
    }
  }
  return { mes, dias: n, transcurridos, enCurso: estado === 'en_curso', puntos, gastado, promedioDiario, proyeccionCierre, presupuesto }
}

export interface PuntoDia {
  fecha: string
  gasto: number
}
/** Gasto por día en un rango cualquiera (para el gráfico de barras con promedio). */
export function gastoPorDia(movs: readonly MovC[], desde: string, hasta: string): { puntos: PuntoDia[]; promedio: number; total: number } {
  const mapa = new Map<string, number>()
  let total = 0
  for (const m of movs) {
    if (!cuenta(m) || m.fecha < desde || m.fecha > hasta) continue
    mapa.set(m.fecha, (mapa.get(m.fecha) ?? 0) + m.cents)
    total += m.cents
  }
  const puntos: PuntoDia[] = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) puntos.push({ fecha: f, gasto: mapa.get(f) ?? 0 })
  return { puntos, promedio: puntos.length ? Math.round(total / puntos.length) : 0, total }
}

