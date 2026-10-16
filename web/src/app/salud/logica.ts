import type { Conciliacion, GrupoFondos, Hojas, Revision } from '@/api/esquemas'
import { aCentimos, deCentimos } from '@/engine/dinero'
import { calcularCalidad, detectarDuplicados, claveTexto, type CalidadDatos, type GrupoDuplicado } from '@/engine/calidad'
import { calcularCompromisos, type CompromisoCalculado, type ResumenCompromisos } from '@/engine/compromisos'
import { primerDia, ultimoDia } from '@/engine/fechas'
import { prepararMovimientos } from '@/engine/movimientos'
import { calcularPresupuestoMes } from '@/engine/presupuesto'
import { tiposDeCambio, umbralesDe } from '@/engine/panel'
import { tipoCambioDe } from '@/lib/catalogo'
import type { CajaCalculada } from '@/engine/presupuesto'

/* ---------------------------- Calidad de datos ---------------------------- */

export interface DatosCalidad {
  calidad: CalidadDatos
  duplicados: GrupoDuplicado[]
}

/** Subcategorías cuyo nombre permite descripción vacía («Otros» y «Por Clasificar»). */
const OPCIONALES = new Set(['otros', 'por clasificar'])

export function calcularCalidadDe(h: Hojas): DatosCalidad {
  const movs = prepararMovimientos(h.movimientos)
  const duplicados = detectarDuplicados(movs, h.revisiones_calidad)
  const calidad = calcularCalidad({
    movs,
    ambitos: h.ambitos,
    categorias: h.categorias,
    subcategorias: h.subcategorias,
    ambitoCategoria: h.ambito_categoria,
    ambitoSubcategoria: h.ambito_subcategoria,
    cajas: h.cajas,
    plantillas: h.plantillas,
    duplicados,
    descripcionOpcionalSub: new Set(h.subcategorias.filter((s) => OPCIONALES.has(claveTexto(s.nombre))).map((s) => s.id)),
    mediosActivos: new Set(h.medios_pago.filter((m) => m.activo).map((m) => m.id)),
  })
  return { calidad, duplicados }
}

export const ETIQUETA_DIMENSION: Record<string, { titulo: string; ayuda: string }> = {
  integridad: { titulo: 'Integridad', ayuda: 'Movimientos con fecha real, monto válido con tipo de cambio, medio de pago y descripción.' },
  clasificacion: { titulo: 'Clasificación', ayuda: 'Movimientos cuyo ámbito, categoría y subcategoría existen, están activos y encajan entre sí.' },
  consistencia: { titulo: 'Consistencia', ayuda: 'Catálogo sin repetidos, cajas sin solapes y plantillas con clasificación vigente.' },
  duplicados: { titulo: 'Duplicados', ayuda: 'Grupos de posibles duplicados que ya marcaste como legítimos o confirmados.' },
}

/** Etiqueta cualitativa del puntaje (para no depender solo del color). */
export function nivelCalidad(p: number): { texto: string; tono: 'ok' | 'warn' | 'danger' } {
  if (p >= 90) return { texto: 'Excelente', tono: 'ok' }
  if (p >= 70) return { texto: 'Aceptable', tono: 'warn' }
  return { texto: 'Necesita revisión', tono: 'danger' }
}

export interface Sugerencia {
  ambito_id: string
  categoria_id: string
  subcategoria_id: string
  texto: string
}

/**
 * Sugerencia para un movimiento con clasificación inactiva: la subcategoría activa con el mismo nombre, si no la primera activa
 * de su categoría, si no la primera categoría activa del ámbito. Solo propone (nunca cambia nada sin que el usuario lo pida).
 */
export function sugerirClasificacion(h: Hojas, movId: string): Sugerencia | null {
  const m = h.movimientos.find((x) => x.id === movId)
  if (!m) return null
  const ambitoActivo = h.ambitos.find((a) => a.id === m.ambito_id)?.activo ? m.ambito_id : h.ambitos.find((a) => a.activo)?.id
  if (!ambitoActivo) return null
  const catsDelAmbito = new Set(h.ambito_categoria.filter((v) => v.ambito_id === ambitoActivo && v.activo).map((v) => v.categoria_id))
  const subOff = new Set(h.ambito_subcategoria.filter((v) => !v.activo).map((v) => `${v.ambito_id}|${v.subcategoria_id}`))
  const subActiva = (id: string) => {
    const s = h.subcategorias.find((x) => x.id === id)
    return !!s && s.activo && !subOff.has(`${ambitoActivo}|${id}`)
  }
  const subOrig = h.subcategorias.find((s) => s.id === m.subcategoria_id)
  const candidatas = h.subcategorias.filter((s) => catsDelAmbito.has(s.categoria_id) && subActiva(s.id))
  const mismoNombre = subOrig ? candidatas.find((s) => claveTexto(s.nombre) === claveTexto(subOrig.nombre)) : undefined
  const enSuCategoria = candidatas.find((s) => s.categoria_id === m.categoria_id)
  const elegida = mismoNombre ?? enSuCategoria ?? candidatas[0]
  if (!elegida) return null
  const cat = h.categorias.find((c) => c.id === elegida.categoria_id)
  return { ambito_id: ambitoActivo, categoria_id: elegida.categoria_id, subcategoria_id: elegida.id, texto: `${cat?.nombre ?? '—'} › ${elegida.nombre}` }
}

/* ---------------------------- Mi presupuesto ---------------------------- */

export interface AlertaCaja {
  caja: CajaCalculada
  nivel: 'atencion' | 'critico' | 'excedida'
}

export interface SaludPresupuesto {
  mes: string
  presupuesto: number
  disponible: number
  /** Pendiente de compromisos del mes. */
  compromisosPendientes: number
  /** disponible − compromisos pendientes (puede ser negativo). */
  disponibleTrasCompromisos: number
  umbrales: { atencion: number; critico: number; excedida: number }
  alertas: AlertaCaja[]
  pctConsumido: number | null
}

export function calcularSaludPresupuesto(h: Hojas, config: Record<string, string>, mes: string): SaludPresupuesto {
  const movs = prepararMovimientos(h.movimientos)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const tc = tiposDeCambio(config)
  const um = umbralesDe(config)
  const r = calcularPresupuestoMes({ mes, movs, fuentes: h.fuentes, fuentesMes: h.fuentes_mes, fuenteMedios: h.fuente_medios, cajas: h.cajas, cajasMes: h.cajas_mes, monedaBase: base, tiposCambio: tc }, um)
  const comp = calcularCompromisos(mes, h.compromisos, h.compromiso_pagos, movs, (mo) => tipoCambioDe(config, mo), base)
  const alertas: AlertaCaja[] = r.cajas
    .filter((c) => c.estado !== 'al_dia')
    .map((c) => ({ caja: c, nivel: c.estado as AlertaCaja['nivel'] }))
    .sort((a, b) => (b.caja.pct ?? 0) - (a.caja.pct ?? 0))
  return { mes, presupuesto: r.presupuesto, disponible: r.disponible, compromisosPendientes: comp.pendiente, disponibleTrasCompromisos: r.disponible - comp.pendiente, umbrales: um, alertas, pctConsumido: r.pctConsumido }
}

/* ---------------------------- Compromisos ---------------------------- */

export type EstadoVisible = 'vencido' | 'proximo' | 'pendiente' | 'pagado' | 'sin_monto'

export interface FilaCompromiso extends CompromisoCalculado {
  visible: EstadoVisible
  /** Días hasta el vencimiento (negativo si ya venció); null si el mes no es el actual o no hay día. */
  dias: number | null
}

/**
 * Lista compacta: vencidos primero, luego próximos por fecha, luego pendientes; los pagados al final (la pantalla los contrae).
 * «Vencido» solo existe en el mes en curso o en meses pasados con saldo pendiente.
 */
export function ordenarCompromisos(resumen: ResumenCompromisos, hoy: string): FilaCompromiso[] {
  const mesHoy = hoy.slice(0, 7)
  const diaHoy = Number(hoy.slice(8, 10))
  const filas = resumen.items.map<FilaCompromiso>((it) => {
    const dia = it.compromiso.dia_vencimiento
    let dias: number | null = null
    if (resumen.mes === mesHoy && dia !== null && dia > 0) dias = dia - diaHoy
    let visible: EstadoVisible
    if (it.estado === 'sin_monto') visible = 'sin_monto'
    else if (it.estado === 'cubierto') visible = 'pagado'
    else if (resumen.mes < mesHoy) visible = 'vencido'
    else if (dias !== null && dias < 0) visible = 'vencido'
    else if (dias !== null && dias <= 7) visible = 'proximo'
    else visible = 'pendiente'
    return { ...it, visible, dias }
  })
  const rango: Record<EstadoVisible, number> = { vencido: 0, proximo: 1, pendiente: 2, sin_monto: 3, pagado: 4 }
  return filas.sort((a, b) => rango[a.visible] - rango[b.visible] || (a.dias ?? 99) - (b.dias ?? 99) || a.compromiso.nombre.localeCompare(b.compromiso.nombre, 'es'))
}

/** Movimientos del mes que pueden asociarse a un compromiso: activos y sin vínculo con otro compromiso. */
export function candidatosAPago(h: Hojas, mes: string, compromisoId: string): Array<{ id: string; fecha: string; descripcion: string; cents: number }> {
  const usados = new Set(h.compromiso_pagos.filter((p) => p.compromiso_id !== compromisoId || p.mes !== mes).map((p) => p.movimiento_id))
  const propios = new Set(h.compromiso_pagos.filter((p) => p.compromiso_id === compromisoId && p.mes === mes).map((p) => p.movimiento_id))
  return prepararMovimientos(h.movimientos)
    .filter((m) => m.mes === mes && !m.anulado && m.cents !== null && !usados.has(m.id) && !propios.has(m.id))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .map((m) => ({ id: m.id, fecha: m.fecha, descripcion: m.descripcion, cents: m.cents as number }))
}

/* ---------------------------- Conciliación de saldos ---------------------------- */

export interface SaldoGrupo {
  /** Saldo calculado (céntimos): Σ restante de las fuentes del grupo al corte. */
  cents: number
  fuentes: Array<{ id: string; nombre: string; asignado: number; consumido: number; restante: number }>
  /** Fuentes del grupo que no están aplicadas en el período (no suman). */
  sinAplicar: string[]
}

/** El saldo calculado considera solo los gastos hasta la fecha de corte inclusive. */
export function saldoCalculadoGrupo(h: Hojas, config: Record<string, string>, grupo: GrupoFondos, periodo: string, fechaCorte: string): SaldoGrupo {
  const ids = new Set(grupo.fuente_ids_json ?? [])
  const movs = prepararMovimientos(h.movimientos).filter((m) => m.fecha <= fechaCorte)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const r = calcularPresupuestoMes({ mes: periodo, movs, fuentes: h.fuentes, fuentesMes: h.fuentes_mes, fuenteMedios: h.fuente_medios, cajas: h.cajas, cajasMes: h.cajas_mes, monedaBase: base, tiposCambio: tiposDeCambio(config) }, umbralesDe(config))
  const delGrupo = r.fuentes.filter((f) => ids.has(f.fuente.id))
  const aplicadas = new Set(delGrupo.map((f) => f.fuente.id))
  return {
    cents: delGrupo.reduce((s, f) => s + f.restante, 0),
    fuentes: delGrupo.map((f) => ({ id: f.fuente.id, nombre: f.fuente.nombre, asignado: f.asignado, consumido: f.consumido, restante: f.restante })),
    sinAplicar: [...ids].filter((id) => !aplicadas.has(id)).map((id) => h.fuentes.find((f) => f.id === id)?.nombre ?? id),
  }
}

export function fechaCorteDefecto(periodo: string, hoy: string): string {
  const fin = ultimoDia(periodo)
  const ini = primerDia(periodo)
  return hoy > fin ? fin : hoy < ini ? ini : hoy
}

export interface Diferencia {
  /** real − calculado, en céntimos. */
  cents: number
  /** Sobre el saldo calculado; null si es 0. */
  pct: number | null
}

export function diferenciaDe(calculadoCents: number, realCents: number): Diferencia {
  const cents = realCents - calculadoCents
  return { cents, pct: calculadoCents !== 0 ? cents / Math.abs(calculadoCents) : null }
}

export type EstadoConciliacion = Conciliacion['estado']

export interface VerificacionVista {
  /** Fila de la verificación (inmutable). */
  verificacion: Conciliacion
  /** Estado vigente: el último seguimiento, o el de la verificación; «desactualizada» se deriva al comparar con el cálculo actual. */
  estado: EstadoConciliacion
  /** Estado guardado (sin derivar). */
  estadoGuardado: EstadoConciliacion
  causa: string
  observacion: string
  /** Fue reemplazada por una verificación posterior. */
  reemplazada: boolean
  historial: Conciliacion[]
  /** Saldo calculado hoy con las mismas reglas (para detectar desactualización). */
  calculadoActual: number | null
}

/**
 * Agrupa la hoja (solo de agregar) en verificaciones vigentes. Una verificación corregida deja de ser vigente porque otra
 * la reemplaza (`reemplaza_a`); nada se borra. «Desactualizada» se detecta comparando la foto guardada con el cálculo actual.
 */
export function verificacionesDe(h: Hojas, config: Record<string, string>): VerificacionVista[] {
  const filas = [...h.conciliaciones].sort((a, b) => (a.creado_en === b.creado_en ? (a.id < b.id ? -1 : 1) : a.creado_en < b.creado_en ? -1 : 1))
  const reemplazadas = new Set(filas.filter((f) => f.tipo === 'verificacion' && f.reemplaza_a).map((f) => f.reemplaza_a))
  const out: VerificacionVista[] = []
  for (const v of filas.filter((f) => f.tipo === 'verificacion')) {
    const historial = filas.filter((f) => f.conciliacion_id === v.conciliacion_id)
    const ultimo = historial[historial.length - 1]!
    const grupo = h.grupos_fondos.find((g) => g.id === v.grupo_id)
    const calculadoActual = grupo ? deCentimos(saldoCalculadoGrupo(h, config, grupo, v.periodo, v.fecha_corte).cents) : null
    const cambio = calculadoActual !== null && aCentimos(calculadoActual) !== aCentimos(v.saldo_calculado ?? 0)
    const guardado = ultimo.estado
    out.push({
      verificacion: v,
      estadoGuardado: guardado,
      estado: cambio && guardado !== 'cerrada_justificada' ? 'desactualizada' : guardado,
      causa: ultimo.causa || v.causa,
      observacion: ultimo.observacion || v.observacion,
      reemplazada: reemplazadas.has(v.id),
      historial,
      calculadoActual,
    })
  }
  return out.sort((a, b) => (a.verificacion.creado_en < b.verificacion.creado_en ? 1 : -1))
}

export const TEXTO_CONCILIACION: Record<EstadoConciliacion, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  conciliada: 'Conciliada',
  cerrada_justificada: 'Cerrada con diferencia justificada',
  desactualizada: 'Desactualizada',
}

/** Solo se puede escribir un grupo activo que no comparta fuentes con otro activo (el servidor también lo exige). */
export function fuenteEnOtroGrupo(grupos: readonly GrupoFondos[], fuenteId: string, exceptoId: string): GrupoFondos | undefined {
  return grupos.find((g) => g.activo && g.id !== exceptoId && (g.fuente_ids_json ?? []).includes(fuenteId))
}

/* ---------------------------- Duplicados ---------------------------- */

export function estadoDeRevision(revs: readonly Revision[], firma: string): Revision['estado'] {
  return revs.find((r) => r.firma === firma)?.estado ?? 'pendiente'
}
