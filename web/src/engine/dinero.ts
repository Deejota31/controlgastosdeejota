/** Todo el dinero del motor se maneja en céntimos enteros. Aquí viven las conversiones. */

/** Pasa un monto con ≤ 2 decimales a céntimos enteros (robusto ante 1.005 * 100). */
export function aCentimos(monto: number): number {
  return Math.round(monto * 100 + (monto >= 0 ? 1e-7 : -1e-7))
}
export function deCentimos(c: number): number {
  return c / 100
}

/** Convierte un monto a la moneda base con un tipo de cambio (o null si no se puede). */
export function convertirCentimos(monto: number, tipoCambio: number | null): number | null {
  if (tipoCambio === null || !(tipoCambio > 0)) return null
  return aCentimos(Math.round(monto * tipoCambio * 100) / 100)
}

/** Porcentaje 0..1 (o null con divisor cero). */
export function proporcion(parte: number, total: number): number | null {
  return total > 0 ? parte / total : null
}

const fmtCache = new Map<string, Intl.NumberFormat>()
export function formatoMoneda(centimos: number, moneda = 'PEN', locale = 'es-PE'): string {
  const k = `${locale}|${moneda}`
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency: moneda, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    fmtCache.set(k, f)
  }
  return f.format(centimos / 100)
}
export function formatoPct(p: number | null, decimales = 0): string {
  if (p === null || !Number.isFinite(p)) return '—'
  return `${(p * 100).toFixed(decimales)} %`
}
