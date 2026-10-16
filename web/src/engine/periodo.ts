import { diasEntre, mesDe, mesesEntre, primerDia, sumarDias, sumarMeses, ultimoDia } from './fechas'

export type PresetPeriodo = 'este_mes' | 'mes_anterior' | 'ultimos_3' | 'ultimos_6' | 'ultimos_12' | 'este_ano' | 'personalizado'

export interface Periodo {
  preset: PresetPeriodo
  desde: string
  hasta: string
}

export const ETIQUETA_PRESET: Record<PresetPeriodo, string> = {
  este_mes: 'Este mes',
  mes_anterior: 'Mes anterior',
  ultimos_3: 'Últimos 3 meses',
  ultimos_6: 'Últimos 6 meses',
  ultimos_12: 'Últimos 12 meses',
  este_ano: 'Este año',
  personalizado: 'Personalizado',
}

/** Resuelve un preset contra la fecha viva de hoy. */
export function periodoDePreset(preset: PresetPeriodo, hoy: string, personalizado?: { desde: string; hasta: string }): Periodo {
  const mes = mesDe(hoy)
  switch (preset) {
    case 'este_mes':
      return { preset, desde: primerDia(mes), hasta: ultimoDia(mes) }
    case 'mes_anterior': {
      const m = sumarMeses(mes, -1)
      return { preset, desde: primerDia(m), hasta: ultimoDia(m) }
    }
    case 'ultimos_3':
    case 'ultimos_6':
    case 'ultimos_12': {
      const n = Number(preset.split('_')[1])
      return { preset, desde: primerDia(sumarMeses(mes, -(n - 1))), hasta: ultimoDia(mes) }
    }
    case 'este_ano': {
      const y = hoy.slice(0, 4)
      return { preset, desde: `${y}-01-01`, hasta: `${y}-12-31` }
    }
    default:
      return { preset: 'personalizado', desde: personalizado?.desde ?? primerDia(mes), hasta: personalizado?.hasta ?? hoy }
  }
}

/** Flechas ← →: mueve el período por su propia amplitud. */
export function moverPeriodo(p: Periodo, direccion: -1 | 1): Periodo {
  const completo = p.desde === primerDia(mesDe(p.desde)) && p.hasta === ultimoDia(mesDe(p.hasta))
  if (completo) {
    const n = mesesEntre(mesDe(p.desde), mesDe(p.hasta)).length
    const d = sumarMeses(mesDe(p.desde), n * direccion)
    const h = sumarMeses(mesDe(p.hasta), n * direccion)
    return { preset: n === 1 ? 'personalizado' : p.preset === 'este_ano' ? 'este_ano' : 'personalizado', desde: primerDia(d), hasta: ultimoDia(h) }
  }
  const dias = diasEntre(p.desde, p.hasta) + 1
  return { preset: 'personalizado', desde: sumarDias(p.desde, dias * direccion), hasta: sumarDias(p.hasta, dias * direccion) }
}

/** Meses completos que cubre el período (null si empieza o termina a mitad de mes). */
export function mesesCompletos(p: { desde: string; hasta: string }): string[] | null {
  if (p.desde !== primerDia(mesDe(p.desde)) || p.hasta !== ultimoDia(mesDe(p.hasta))) return null
  return mesesEntre(mesDe(p.desde), mesDe(p.hasta))
}

export function etiquetaPeriodo(p: { desde: string; hasta: string }, locale = 'es-PE'): string {
  const meses = mesesCompletos(p)
  const f = (s: string, opt: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opt }).format(new Date(`${s}T00:00:00Z`))
  if (meses && meses.length === 1) return f(p.desde, { month: 'long', year: 'numeric' })
  return `${f(p.desde, { day: 'numeric', month: 'short', year: 'numeric' })} – ${f(p.hasta, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
