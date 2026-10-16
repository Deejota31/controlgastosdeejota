/** Aritmética de fechas AAAA-MM-DD y AAAA-MM sin zonas horarias (la fecha de negocio ya viene resuelta). */

export const esFechaValida = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))]
  return m >= 1 && m <= 12 && d >= 1 && d <= diasEnMes(`${s.slice(0, 7)}`) && y > 1900
}
export const mesDe = (fecha: string): string => fecha.slice(0, 7)
export function diasEnMes(mes: string): number {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export function sumarMeses(mes: string, n: number): string {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}`
}
export const primerDia = (mes: string): string => `${mes}-01`
export const ultimoDia = (mes: string): string => `${mes}-${String(diasEnMes(mes)).padStart(2, '0')}`
export const diaDe = (fecha: string): number => Number(fecha.slice(8, 10))

export function sumarDias(fecha: string, n: number): string {
  const t = Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10))) + n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}
export function diasEntre(desde: string, hasta: string): number {
  const f = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((f(hasta) - f(desde)) / 86_400_000)
}
/** Lista de meses entre dos meses, ambos inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let m = desde; m <= hasta; m = sumarMeses(m, 1)) out.push(m)
  return out
}
/** Mismo día del mes `n` meses antes, recortado al último día del mes destino. */
export function mismoDiaHaceMeses(fecha: string, n: number): string {
  const mes = sumarMeses(mesDe(fecha), -n)
  const d = Math.min(diaDe(fecha), diasEnMes(mes))
  return `${mes}-${String(d).padStart(2, '0')}`
}

export type EstadoMes = 'pasado' | 'en_curso' | 'futuro'
export function estadoDelMes(mes: string, hoy: string): EstadoMes {
  const h = mesDe(hoy)
  return mes < h ? 'pasado' : mes > h ? 'futuro' : 'en_curso'
}
/** Días transcurridos del mes, inclusive del día de hoy; siempre con la fecha viva que se pase. */
export function diasTranscurridos(mes: string, hoy: string): number {
  const e = estadoDelMes(mes, hoy)
  return e === 'pasado' ? diasEnMes(mes) : e === 'futuro' ? 0 : diaDe(hoy)
}
