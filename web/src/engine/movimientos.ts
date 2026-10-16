import type { Movimiento } from '@/api/esquemas'
import { aCentimos } from './dinero'
import { mesDe } from './fechas'
import type { Filtro, MovC } from './tipos'

const cache = new WeakMap<readonly Movimiento[], MovC[]>()

/**
 * Prepara los movimientos para calcular: céntimos en moneda base (monto_base congelado al registrar),
 * claves ya resueltas. Se memoiza por identidad del arreglo.
 */
export function prepararMovimientos(movs: readonly Movimiento[]): MovC[] {
  const previo = cache.get(movs)
  if (previo) return previo
  const out: MovC[] = new Array(movs.length)
  for (let i = 0; i < movs.length; i++) {
    const m = movs[i]!
    out[i] = {
      id: m.id,
      fecha: m.fecha,
      mes: mesDe(m.fecha),
      cents: m.monto_base === null ? null : aCentimos(m.monto_base),
      montoOrig: m.monto,
      moneda: m.moneda,
      ambito: m.ambito_id,
      categoria: m.categoria_id,
      sub: m.subcategoria_id,
      medio: m.medio_pago_id,
      tipo: m.tipo_gasto,
      recurrente: m.es_recurrente,
      anulado: m.estado === 'anulado',
      descripcion: m.descripcion,
    }
  }
  cache.set(movs, out)
  return out
}

/** Movimientos que cuentan: activos y con tipo de cambio. */
export const cuenta = (m: MovC): m is MovC & { cents: number } => !m.anulado && m.cents !== null

export function aplicarFiltro(movs: readonly MovC[], f: Filtro, normalizarTexto: (s: string) => string = (s) => s.toLowerCase()): MovC[] {
  const amb = f.ambitos?.length ? new Set(f.ambitos) : null
  const cat = f.categorias?.length ? new Set(f.categorias) : null
  const sub = f.subcategorias?.length ? new Set(f.subcategorias) : null
  const med = f.medios?.length ? new Set(f.medios) : null
  const tip = f.tipos?.length ? new Set(f.tipos) : null
  const q = f.texto ? normalizarTexto(f.texto.trim()) : ''
  const out: MovC[] = []
  for (const m of movs) {
    if (m.fecha < f.desde || m.fecha > f.hasta) continue
    if (amb && !amb.has(m.ambito)) continue
    if (cat && !cat.has(m.categoria)) continue
    if (sub && !sub.has(m.sub)) continue
    if (med && !med.has(m.medio)) continue
    if (tip && !tip.has(m.tipo)) continue
    if (f.recurrente === 'si' && !m.recurrente) continue
    if (f.recurrente === 'no' && m.recurrente) continue
    if (q && !normalizarTexto(m.descripcion).includes(q)) continue
    out.push(m)
  }
  return out
}

export interface Totales {
  /** Suma de movimientos activos con tipo de cambio, en céntimos. */
  total: number
  cantidad: number
  mayor: number
  /** Activos excluidos por falta de tipo de cambio. */
  sinTipoCambio: number
  /** Anulados (se muestran aparte; no suman). */
  anulados: number
  anuladosTotal: number
}

export function totales(movs: readonly MovC[]): Totales {
  let total = 0, cantidad = 0, mayor = 0, sin = 0, anulados = 0, anuladosTotal = 0
  for (const m of movs) {
    if (m.anulado) {
      anulados++
      anuladosTotal += m.cents ?? 0
      continue
    }
    if (m.cents === null) {
      sin++
      continue
    }
    total += m.cents
    cantidad++
    if (m.cents > mayor) mayor = m.cents
  }
  return { total, cantidad, mayor, sinTipoCambio: sin, anulados, anuladosTotal }
}

export interface Agrupado {
  id: string
  total: number
  cantidad: number
}

/** Agrupa los gastos que cuentan por una clave. Orden: mayor total primero (desempate por id). */
export function agruparPor(movs: readonly MovC[], clave: (m: MovC) => string): Agrupado[] {
  const mapa = new Map<string, Agrupado>()
  for (const m of movs) {
    if (!cuenta(m)) continue
    const k = clave(m)
    const g = mapa.get(k)
    if (g) {
      g.total += m.cents
      g.cantidad++
    } else mapa.set(k, { id: k, total: m.cents, cantidad: 1 })
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1))
}
