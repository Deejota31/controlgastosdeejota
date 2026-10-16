import type { Hojas, Plantilla } from '@/api/esquemas'
import { aCentimos } from '@/engine/dinero'
import { calcularCompromisos, type CompromisoCalculado } from '@/engine/compromisos'
import { prepararMovimientos } from '@/engine/movimientos'
import { tiposDeCambio } from '@/engine/panel'
import { categoriasDeAmbito, subcategoriasEfectivas, tipoCambioDe } from '@/lib/catalogo'
import { normalizarBusqueda } from '@/lib/texto'

/** Datos de una plantilla de gasto (los guarda el servidor en `datos_json`). */
export interface DatosGasto {
  ambito_id: string
  categoria_id: string
  subcategoria_id: string
  descripcion: string
  monto: number | null
  moneda: string
  medio_pago_id: string
  tipo_gasto: 'fijo' | 'variable' | 'extraordinario'
  es_recurrente: boolean
  es_compromiso: boolean
  dia_vencimiento: number | null
}

export function datosDe(p: Plantilla): DatosGasto {
  const d = (p.datos_json ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')
  const tipo = d['tipo_gasto']
  return {
    ambito_id: s('ambito_id'),
    categoria_id: s('categoria_id'),
    subcategoria_id: s('subcategoria_id'),
    descripcion: s('descripcion'),
    monto: typeof d['monto'] === 'number' ? d['monto'] : null,
    moneda: s('moneda'),
    medio_pago_id: s('medio_pago_id'),
    tipo_gasto: tipo === 'fijo' || tipo === 'extraordinario' ? tipo : 'variable',
    es_recurrente: d['es_recurrente'] === true,
    es_compromiso: d['es_compromiso'] === true,
    dia_vencimiento: typeof d['dia_vencimiento'] === 'number' ? d['dia_vencimiento'] : null,
  }
}

export function plantillasDeGasto(h: Hojas): Plantilla[] {
  return h.plantillas.filter((p) => p.tipo === 'gasto').sort((a, b) => a.orden - b.orden)
}

/** Motivo por el que una plantilla no se puede usar hasta editarla; null si está lista. */
export function motivoRevision(h: Hojas, d: DatosGasto): string | null {
  const amb = h.ambitos.find((x) => x.id === d.ambito_id)
  if (!amb) return 'El ámbito ya no existe.'
  if (!amb.activo) return `El ámbito «${amb.nombre}» está inactivo.`
  const cat = h.categorias.find((x) => x.id === d.categoria_id)
  if (!cat) return 'La categoría ya no existe.'
  if (!categoriasDeAmbito(h, d.ambito_id).some((c) => c.id === d.categoria_id)) return `La categoría «${cat.nombre}» está inactiva en «${amb.nombre}».`
  const subsActivas = subcategoriasEfectivas(h, d.categoria_id, d.ambito_id)
  if (d.subcategoria_id) {
    const sub = h.subcategorias.find((x) => x.id === d.subcategoria_id)
    if (!sub) return 'La subcategoría ya no existe.'
    if (!subsActivas.some((x) => x.id === sub.id)) return `La subcategoría «${sub.nombre}» está inactiva.`
  } else if (subsActivas.length > 0) return 'Falta elegir la subcategoría.'
  const medio = h.medios_pago.find((x) => x.id === d.medio_pago_id)
  if (!medio) return 'El medio de pago ya no existe.'
  if (!medio.activo) return `El medio de pago «${medio.nombre}» está inactivo.`
  return null
}

export interface FilaGasto {
  plantilla: Plantilla
  datos: DatosGasto
  revision: string | null
  /** Compromiso activo ligado a la plantilla (si es de tipo compromiso). */
  compromiso: CompromisoCalculado | null
  /** Etiqueta «Categoría › Subcategoría» para mostrar. */
  clasificacion: string
}

export function filasDeGastos(h: Hojas, config: Record<string, string>, mes: string): FilaGasto[] {
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const tc = tiposDeCambio(config)
  const resumen = calcularCompromisos(mes, h.compromisos, h.compromiso_pagos, prepararMovimientos(h.movimientos), (m) => tc[m] ?? null, base)
  return plantillasDeGasto(h).map((plantilla) => {
    const datos = datosDe(plantilla)
    const cat = h.categorias.find((x) => x.id === datos.categoria_id)?.nombre ?? '—'
    const sub = h.subcategorias.find((x) => x.id === datos.subcategoria_id)?.nombre
    return {
      plantilla,
      datos,
      revision: motivoRevision(h, datos),
      compromiso: datos.es_compromiso ? (resumen.items.find((i) => i.compromiso.plantilla_id === plantilla.id) ?? null) : null,
      clasificacion: sub ? `${cat} › ${sub}` : cat,
    }
  })
}

export function filtrarGastos(filas: FilaGasto[], texto: string, ambitoId: string): FilaGasto[] {
  const q = normalizarBusqueda(texto)
  return filas.filter((f) => {
    if (ambitoId && f.datos.ambito_id !== ambitoId) return false
    if (!q) return true
    return normalizarBusqueda(`${f.plantilla.nombre} ${f.datos.descripcion} ${f.clasificacion}`).includes(q)
  })
}

/** Valores temporales de una fila del modal: nunca modifican la plantilla. */
export interface Edicion {
  monto: string
  moneda: string
  medio: string
}

export interface ItemLote {
  id: string
  fecha: string
  monto: number
  moneda: string
  ambito_id: string
  categoria_id: string
  subcategoria_id: string
  descripcion: string
  medio_pago_id: string
  tipo_gasto: DatosGasto['tipo_gasto']
  es_recurrente: boolean
  compromiso_id?: string
}

/** Un gasto sin monto, con moneda sin tipo de cambio o con un medio inactivo no se puede registrar. */
export function problemaDeFila(h: Hojas, config: Record<string, string>, f: FilaGasto, e: Edicion): string | null {
  if (f.revision) return f.revision
  const monto = Number(e.monto.replace(',', '.'))
  if (e.monto.trim() === '' || !Number.isFinite(monto) || !(monto > 0)) return 'Escribe un monto mayor que cero.'
  if (aCentimos(monto) / 100 !== monto) return 'Usa como máximo 2 decimales.'
  if (tipoCambioDe(config, e.moneda) === null) return `Falta el tipo de cambio ${e.moneda}.`
  const medio = h.medios_pago.find((x) => x.id === e.medio)
  if (!medio) return 'Elige el medio de pago.'
  if (!medio.activo && e.medio !== f.datos.medio_pago_id) return `El medio «${medio.nombre}» está inactivo.`
  return null
}

export function construirLote(fecha: string, filas: Array<{ fila: FilaGasto; edicion: Edicion; id: string }>): ItemLote[] {
  return filas.map(({ fila, edicion, id }) => ({
    id,
    fecha,
    monto: Number(edicion.monto.replace(',', '.')),
    moneda: edicion.moneda,
    ambito_id: fila.datos.ambito_id,
    categoria_id: fila.datos.categoria_id,
    subcategoria_id: fila.datos.subcategoria_id,
    descripcion: fila.datos.descripcion || fila.plantilla.nombre,
    medio_pago_id: edicion.medio,
    tipo_gasto: fila.datos.tipo_gasto,
    es_recurrente: fila.datos.es_recurrente,
    ...(fila.compromiso ? { compromiso_id: fila.compromiso.compromiso.id } : {}),
  }))
}

export interface TotalMoneda {
  moneda: string
  cents: number
}
export function totalesPorMoneda(items: ReadonlyArray<{ monto: number; moneda: string }>): TotalMoneda[] {
  const m = new Map<string, number>()
  for (const i of items) m.set(i.moneda, (m.get(i.moneda) ?? 0) + aCentimos(i.monto))
  return [...m.entries()].map(([moneda, cents]) => ({ moneda, cents })).sort((a, b) => a.moneda.localeCompare(b.moneda))
}

/** ¿Ya hay una plantilla con exactamente los mismos datos? El servidor también lo rechaza; esto lo avisa antes. */
export function plantillaDuplicada(h: Hojas, datos: Partial<DatosGasto>, excluirId?: string): Plantilla | null {
  const clave = (d: Partial<DatosGasto>) => JSON.stringify([d.ambito_id, d.categoria_id, d.subcategoria_id || '', normalizarBusqueda(d.descripcion ?? ''), d.monto ?? null, d.moneda, d.medio_pago_id, d.tipo_gasto, !!d.es_recurrente, !!d.es_compromiso, d.es_compromiso ? d.dia_vencimiento : null])
  const k = clave(datos)
  return plantillasDeGasto(h).find((p) => p.id !== excluirId && clave(datosDe(p)) === k) ?? null
}
