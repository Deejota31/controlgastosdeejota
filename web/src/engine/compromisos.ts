import type { Compromiso, CompromisoPago } from '@/api/esquemas'
import { aCentimos } from './dinero'
import type { MovC } from './tipos'

export type EstadoCompromiso = 'cubierto' | 'parcial' | 'pendiente' | 'sin_monto'

export interface CompromisoCalculado {
  compromiso: Compromiso
  /** null = sin monto previsto. */
  previsto: number | null
  pagado: number
  pendiente: number
  estado: EstadoCompromiso
  /** Pagos vinculados activos del mes. */
  pagos: Array<{ movimientoId: string; cents: number }>
}

export interface ResumenCompromisos {
  mes: string
  items: CompromisoCalculado[]
  previsto: number
  pagado: number
  pendiente: number
}

/** pendiente = max(0, previsto − pagos vinculados del mes). Anular un pago deja de cubrir; restaurarlo vuelve a cubrir. */
export function calcularCompromisos(
  mes: string,
  compromisos: readonly Compromiso[],
  pagos: readonly CompromisoPago[],
  movs: readonly MovC[],
  tipoCambio: (moneda: string) => number | null,
  monedaBase: string,
): ResumenCompromisos {
  const movPorId = new Map(movs.map((m) => [m.id, m]))
  const items: CompromisoCalculado[] = []
  let previsto = 0, pagado = 0, pendiente = 0
  for (const c of compromisos) {
    if (!c.activo) continue
    let prev: number | null = null
    if (c.monto_previsto !== null && c.monto_previsto > 0) {
      const tc = c.moneda === monedaBase ? 1 : tipoCambio(c.moneda)
      prev = tc === null ? null : aCentimos(Math.round(c.monto_previsto * tc * 100) / 100)
    }
    const lista: Array<{ movimientoId: string; cents: number }> = []
    let pag = 0
    for (const p of pagos) {
      if (p.compromiso_id !== c.id || p.mes !== mes) continue
      const m = movPorId.get(p.movimiento_id)
      if (!m || m.anulado || m.cents === null) continue
      lista.push({ movimientoId: m.id, cents: m.cents })
      pag += m.cents
    }
    const pend = prev === null ? 0 : Math.max(0, prev - pag)
    const estado: EstadoCompromiso = prev === null ? 'sin_monto' : pag >= prev ? 'cubierto' : pag > 0 ? 'parcial' : 'pendiente'
    items.push({ compromiso: c, previsto: prev, pagado: pag, pendiente: pend, estado, pagos: lista })
    previsto += prev ?? 0
    pagado += pag
    pendiente += pend
  }
  return { mes, items, previsto, pagado, pendiente }
}
