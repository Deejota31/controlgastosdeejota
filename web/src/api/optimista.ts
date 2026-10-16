import { normalizarDescripcion, EXCEPCIONES_DESCRIPCION_DEFECTO } from '@shared/descripcion.js'
import type { Hojas, Movimiento } from './esquemas'

/**
 * Reductores optimistas: aplican en el cliente, al instante, lo que el servidor hará al procesar la
 * escritura. Son puros: la vista visible = estado confirmado + reductores de las escrituras pendientes.
 */
export interface ContextoOpt {
  config: Record<string, string>
  ahora: string
}
export type Reductor = (h: Hojas, p: Record<string, unknown>, c: ContextoOpt) => Hojas

const str = (p: Record<string, unknown>, k: string, def = '') => (typeof p[k] === 'string' ? (p[k] as string) : def)
const num = (p: Record<string, unknown>, k: string) => (typeof p[k] === 'number' ? (p[k] as number) : Number(p[k]))
const redondear2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

export function excepcionesDe(config: Record<string, string>): string[] {
  const t = config['desc_excepciones']
  return t ? t.split(',').map((s) => s.trim()).filter(Boolean) : EXCEPCIONES_DESCRIPCION_DEFECTO
}

export function construirMovimientoLocal(p: Record<string, unknown>, previo: Movimiento | undefined, c: ContextoOpt): Movimiento {
  const moneda = str(p, 'moneda') || c.config['moneda_base'] || 'PEN'
  const base = c.config['moneda_base'] || 'PEN'
  let tc: number | null
  if (previo && previo.moneda === moneda) tc = previo.tipo_cambio
  else if (moneda === base) tc = 1
  else {
    const t = Number(c.config['tipo_cambio_' + moneda])
    tc = t > 0 ? t : null
  }
  const monto = num(p, 'monto')
  const tipo = str(p, 'tipo_gasto', previo?.tipo_gasto ?? 'variable')
  return {
    id: str(p, 'id'),
    fecha: str(p, 'fecha'),
    monto,
    moneda,
    tipo_cambio: tc,
    monto_base: tc === null ? null : redondear2(monto * tc),
    ambito_id: str(p, 'ambito_id'),
    categoria_id: str(p, 'categoria_id'),
    subcategoria_id: str(p, 'subcategoria_id'),
    descripcion: normalizarDescripcion(str(p, 'descripcion'), excepcionesDe(c.config)),
    medio_pago_id: str(p, 'medio_pago_id'),
    tipo_gasto: tipo === 'fijo' || tipo === 'extraordinario' ? tipo : 'variable',
    es_recurrente: p['es_recurrente'] === true,
    estado: previo?.estado ?? 'activo',
    origen: previo?.origen ?? (str(p, 'origen') || 'web'),
    plantilla_id: str(p, 'plantilla_id'),
    lote_id: previo?.lote_id ?? str(p, 'lote_id'),
    comprobante_url: str(p, 'comprobante_url'),
    notas: str(p, 'notas'),
    creado_en: previo?.creado_en ?? c.ahora,
    actualizado_en: c.ahora,
    version: previo ? previo.version + 1 : 1,
  }
}

function upsertMov(h: Hojas, m: Movimiento): Hojas {
  const i = h.movimientos.findIndex((x) => x.id === m.id)
  const movimientos = h.movimientos.slice()
  if (i === -1) movimientos.push(m)
  else movimientos[i] = m
  return { ...h, movimientos }
}

function cambiarEstado(estado: 'activo' | 'anulado'): Reductor {
  return (h, p, c) => {
    const previo = h.movimientos.find((x) => x.id === str(p, 'id'))
    if (!previo || previo.estado === estado) return h
    return upsertMov(h, { ...previo, estado, actualizado_en: c.ahora, version: previo.version + 1 })
  }
}

export const REDUCTORES: Record<string, Reductor> = {
  'movimiento.guardar': (h, p, c) => {
    const previo = h.movimientos.find((x) => x.id === str(p, 'id'))
    if (previo && (p['version'] === undefined || p['version'] === null)) return h // reintento de un alta ya aplicada
    return upsertMov(h, construirMovimientoLocal(p, previo, c))
  },
  'movimiento.anular': cambiarEstado('anulado'),
  'movimiento.restaurar': cambiarEstado('activo'),
  'movimientos.lote': (h, p, c) => {
    const items = Array.isArray(p['items']) ? (p['items'] as Array<Record<string, unknown>>) : []
    let out = h
    for (const it of items) {
      if (out.movimientos.some((x) => x.id === str(it, 'id'))) continue
      out = upsertMov(out, { ...construirMovimientoLocal({ ...it, lote_id: str(p, 'lote_id') }, undefined, c), origen: 'lote' })
    }
    return out
  },
}

REDUCTORES['movimientos.accionLote'] = (h, p, c) => {
  const ids = new Set(Array.isArray(p['ids']) ? (p['ids'] as unknown[]).filter((x): x is string => typeof x === 'string') : [])
  const accion = str(p, 'accion')
  // Todo o nada: si falta alguno o la acción no aplica a alguno, el servidor rechazará el lote entero; aquí no se aplica nada.
  const objetivo = h.movimientos.filter((m) => ids.has(m.id))
  if (objetivo.length !== ids.size) return h
  if ((accion === 'medio' || accion === 'categoria') && objetivo.some((m) => m.estado === 'anulado')) return h
  const cambia = (m: Movimiento): Movimiento => {
    if (accion === 'anular') return m.estado === 'anulado' ? m : { ...m, estado: 'anulado' }
    if (accion === 'restaurar') return m.estado === 'activo' ? m : { ...m, estado: 'activo' }
    if (accion === 'medio') return { ...m, medio_pago_id: str(p, 'medio_pago_id', m.medio_pago_id) }
    if (accion === 'categoria')
      return { ...m, ambito_id: str(p, 'ambito_id', m.ambito_id), categoria_id: str(p, 'categoria_id', m.categoria_id), subcategoria_id: str(p, 'subcategoria_id') }
    return m
  }
  const movimientos = h.movimientos.map((m) => {
    if (!ids.has(m.id)) return m
    const n = cambia(m)
    return n === m ? m : { ...n, actualizado_en: c.ahora, version: m.version + 1 }
  })
  return { ...h, movimientos }
}

REDUCTORES['movimientos.reordenar'] = (h, p) => {
  const items = Array.isArray(p['items']) ? (p['items'] as Array<Record<string, unknown>>) : []
  const mapa = new Map(h.orden_movimientos.map((o) => [o.movimiento_id, o] as const))
  for (const it of items) {
    const id = str(it, 'movimiento_id')
    if (id) mapa.set(id, { movimiento_id: id, orden: Number(it['orden']) })
  }
  return { ...h, orden_movimientos: [...mapa.values()] }
}

export function aplicarPendientes(
  confirmado: Hojas,
  pendientes: ReadonlyArray<{ action: string; payload: Record<string, unknown> }>,
  c: ContextoOpt,
): Hojas {
  let h = confirmado
  for (const it of pendientes) {
    const r = REDUCTORES[it.action]
    if (r) h = r(h, it.payload, c)
  }
  return h
}
