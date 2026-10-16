import type { Hojas, Movimiento } from '@/api/esquemas'
import { aCentimos } from '@/engine/dinero'
import { prepararMovimientos } from '@/engine/movimientos'
import { normalizarBusqueda } from '@/lib/texto'

export type EstadoFiltro = 'activos' | 'anulados' | 'todos'
export type ColOrden = 'fecha' | 'descripcion' | 'categoria' | 'medio' | 'monto' | 'estado' | 'manual'

export interface Consulta {
  texto: string
  estado: EstadoFiltro
  desde: string
  hasta: string
  ambitos: string[]
  categorias: string[]
  medios: string[]
  subcategorias?: string[]
  tipos?: string[]
  recurrente?: 'todos' | 'si' | 'no'
  orden: ColOrden
  dir: 'asc' | 'desc'
}

type Vista = Pick<Hojas, 'movimientos' | 'ambitos' | 'categorias' | 'subcategorias' | 'medios_pago' | 'orden_movimientos'>

export interface Nombres {
  categoria: (id: string) => string
  sub: (id: string) => string
  medio: (id: string) => string
  ambito: (id: string) => string
}

export function nombresDe(v: Pick<Hojas, 'ambitos' | 'categorias' | 'subcategorias' | 'medios_pago'>): Nombres {
  const mk = <T extends { id: string; nombre: string }>(l: T[]) => {
    const m = new Map(l.map((x) => [x.id, x.nombre] as const))
    return (id: string) => m.get(id) ?? '—'
  }
  return { categoria: mk(v.categorias), sub: mk(v.subcategorias), medio: mk(v.medios_pago), ambito: mk(v.ambitos) }
}

const cents = (m: Movimiento) => (m.monto_base === null ? null : aCentimos(m.monto_base))

/** Filtra y ordena. El orden por defecto es fecha descendente y, a igual fecha, el más reciente primero. */
export function consultar(v: Vista, q: Consulta, n: Nombres): Movimiento[] {
  const texto = normalizarBusqueda(q.texto)
  const amb = q.ambitos.length ? new Set(q.ambitos) : null
  const cat = q.categorias.length ? new Set(q.categorias) : null
  const med = q.medios.length ? new Set(q.medios) : null
  const sub = q.subcategorias?.length ? new Set(q.subcategorias) : null
  const tip = q.tipos?.length ? new Set(q.tipos) : null
  const out = v.movimientos.filter((m) => {
    if (q.estado === 'activos' && m.estado !== 'activo') return false
    if (q.estado === 'anulados' && m.estado !== 'anulado') return false
    if (q.desde && m.fecha < q.desde) return false
    if (q.hasta && m.fecha > q.hasta) return false
    if (amb && !amb.has(m.ambito_id)) return false
    if (cat && !cat.has(m.categoria_id)) return false
    if (med && !med.has(m.medio_pago_id)) return false
    if (sub && !sub.has(m.subcategoria_id)) return false
    if (tip && !tip.has(m.tipo_gasto)) return false
    if (q.recurrente === 'si' && !m.es_recurrente) return false
    if (q.recurrente === 'no' && m.es_recurrente) return false
    if (texto) {
      const pajar = normalizarBusqueda(`${m.descripcion} ${m.notas} ${n.categoria(m.categoria_id)} ${n.sub(m.subcategoria_id)} ${n.medio(m.medio_pago_id)}`)
      if (!pajar.includes(texto)) return false
    }
    return true
  })
  const rec = (a: Movimiento, b: Movimiento) => (a.fecha === b.fecha ? b.creado_en.localeCompare(a.creado_en) || (a.id < b.id ? -1 : 1) : b.fecha.localeCompare(a.fecha))
  if (q.orden === 'manual') {
    const ord = new Map(v.orden_movimientos.map((o) => [o.movimiento_id, o.orden] as const))
    return out.sort((a, b) => {
      const oa = ord.get(a.id)
      const ob = ord.get(b.id)
      if (oa !== undefined && ob !== undefined) return oa - ob || rec(a, b)
      if (oa !== undefined) return -1
      if (ob !== undefined) return 1
      return rec(a, b)
    })
  }
  const signo = q.dir === 'asc' ? 1 : -1
  const cmp: Record<Exclude<ColOrden, 'manual'>, (a: Movimiento, b: Movimiento) => number> = {
    fecha: (a, b) => a.fecha.localeCompare(b.fecha) || a.creado_en.localeCompare(b.creado_en),
    descripcion: (a, b) => a.descripcion.localeCompare(b.descripcion, 'es'),
    categoria: (a, b) => n.categoria(a.categoria_id).localeCompare(n.categoria(b.categoria_id), 'es') || n.sub(a.subcategoria_id).localeCompare(n.sub(b.subcategoria_id), 'es'),
    medio: (a, b) => n.medio(a.medio_pago_id).localeCompare(n.medio(b.medio_pago_id), 'es'),
    monto: (a, b) => {
      const ca = cents(a)
      const cb = cents(b)
      if (ca === null && cb === null) return 0
      if (ca === null) return signo // sin tipo de cambio siempre al final
      if (cb === null) return -signo
      return ca - cb
    },
    estado: (a, b) => a.estado.localeCompare(b.estado),
  }
  const f = cmp[q.orden]
  return out.sort((a, b) => signo * f(a, b) || rec(a, b))
}

/** Totales con la misma conversión que el resto de la aplicación (monto_base congelado, céntimos enteros). */
export function totalesDe(lista: readonly Movimiento[]) {
  let total = 0
  let cantidad = 0
  let mayor = 0
  let sinTC = 0
  let anulados = 0
  for (const m of prepararMovimientos(lista)) {
    if (m.anulado) {
      anulados++
      continue
    }
    if (m.cents === null) {
      sinTC++
      continue
    }
    total += m.cents
    cantidad++
    if (m.cents > mayor) mayor = m.cents
  }
  return { total, cantidad, mayor, sinTC, anulados }
}

/** Resumen del impacto de una acción en lote sobre la selección (para confirmar antes de enviar). */
export function impactoLote(sel: readonly Movimiento[], accion: 'anular' | 'restaurar' | 'categoria' | 'medio') {
  const aplican = sel.filter((m) => (accion === 'anular' ? m.estado === 'activo' : accion === 'restaurar' ? m.estado === 'anulado' : m.estado === 'activo'))
  const omitidos = sel.length - aplican.length
  const bloquea = (accion === 'categoria' || accion === 'medio') && sel.some((m) => m.estado === 'anulado')
  const total = prepararMovimientos(aplican).reduce((s, m) => s + (m.cents ?? 0), 0)
  return { aplican: aplican.length, omitidos, total, bloquea }
}
