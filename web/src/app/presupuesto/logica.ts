import type { Caja, CajaMes, Fuente, FuenteMes, Hojas } from '@/api/esquemas'
import { prepararMovimientos } from '@/engine/movimientos'
import { tiposDeCambio, umbralesDe } from '@/engine/panel'
import { calcularPresupuestoMes, type CajaCalculada, type ResultadoPresupuesto } from '@/engine/presupuesto'
import { sumarMeses } from '@/engine/fechas'
import { normalizarBusqueda } from '@/lib/texto'

export type EstadoMes = 'aplicada' | 'omitida' | 'sin_aplicar'

/** Misma regla que `fuenteVigente` del backend. */
export function fuenteVigente(f: Pick<Fuente, 'recurrencia' | 'mes_inicio' | 'mes_fin'>, mes: string): boolean {
  if (f.recurrencia === 'unica') return mes === f.mes_inicio
  if (f.mes_inicio && mes < f.mes_inicio) return false
  if (f.mes_fin && mes > f.mes_fin) return false
  return true
}

/** Calcula el presupuesto de un mes con los datos y la configuración dados (siempre sobre céntimos enteros). */
export function calcularMes(h: Hojas, config: Record<string, string>, mes: string): ResultadoPresupuesto {
  const movs = prepararMovimientos(h.movimientos)
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  return calcularPresupuestoMes(
    { mes, movs, fuentes: h.fuentes, fuentesMes: h.fuentes_mes, fuenteMedios: h.fuente_medios, cajas: h.cajas, cajasMes: h.cajas_mes, monedaBase: base, tiposCambio: tiposDeCambio(config) },
    umbralesDe(config),
  )
}

export function estadoEnMes(filas: ReadonlyArray<FuenteMes | CajaMes>, clave: 'fuente_id' | 'caja_id', id: string, mes: string): { estado: EstadoMes; monto: number | null } {
  const f = (filas as ReadonlyArray<Record<string, unknown>>).find((x) => x[clave] === id && x['mes'] === mes)
  if (!f) return { estado: 'sin_aplicar', monto: null }
  return { estado: f['estado'] === 'omitida' ? 'omitida' : 'aplicada', monto: Number(f['monto']) }
}

export interface Resumen {
  presupuesto: number
  reservado: number
  disponible: number
  saldoLibre: number
}
const resumenDe = (r: ResultadoPresupuesto): Resumen => ({ presupuesto: r.presupuesto, reservado: r.reservado, disponible: r.disponible, saldoLibre: r.saldoLibre })

export interface Impacto {
  antes: Resumen
  despues: Resumen
  /** true si el cambio no mueve ninguna cifra de este mes (no está aplicada o no está vigente). */
  sinEfecto: boolean
}

/** Qué pasaría este mes si se activa o desactiva una fuente o una caja. No toca los datos originales. */
export function impactoDeActivar(h: Hojas, config: Record<string, string>, mes: string, tipo: 'fuente' | 'caja', id: string, activo: boolean): Impacto {
  const antes = resumenDe(calcularMes(h, config, mes))
  const simulado: Hojas =
    tipo === 'fuente'
      ? { ...h, fuentes: h.fuentes.map((f) => (f.id === id ? { ...f, activo } : f)) }
      : { ...h, cajas: h.cajas.map((c) => (c.id === id ? { ...c, activo } : c)) }
  const despues = resumenDe(calcularMes(simulado, config, mes))
  const sinEfecto = antes.presupuesto === despues.presupuesto && antes.reservado === despues.reservado && antes.disponible === despues.disponible && antes.saldoLibre === despues.saldoLibre
  return { antes, despues, sinEfecto }
}

/* ---------- Alcance de las cajas ---------- */

export type Alcance = Caja['alcance']
export const ETIQUETA_ALCANCE: Record<Alcance, string> = { ambito: 'Ámbito', categoria: 'Categoría', subcategoria: 'Subcategoría', medio_pago: 'Medio de pago' }

export function nombreAlcance(h: Hojas, alcance: Alcance, id: string): string {
  switch (alcance) {
    case 'ambito':
      return h.ambitos.find((x) => x.id === id)?.nombre ?? 'Ámbito eliminado'
    case 'categoria':
      return h.categorias.find((x) => x.id === id)?.nombre ?? 'Categoría eliminada'
    case 'medio_pago':
      return h.medios_pago.find((x) => x.id === id)?.nombre ?? 'Medio eliminado'
    case 'subcategoria': {
      const s = h.subcategorias.find((x) => x.id === id)
      if (!s) return 'Subcategoría eliminada'
      const c = h.categorias.find((x) => x.id === s.categoria_id)
      return `${c?.nombre ?? '—'} › ${s.nombre}`
    }
  }
}

export function opcionesAlcance(h: Hojas, alcance: Alcance): Array<{ valor: string; etiqueta: string }> {
  const lista =
    alcance === 'ambito'
      ? h.ambitos.filter((x) => x.activo).map((x) => ({ valor: x.id, etiqueta: x.nombre }))
      : alcance === 'categoria'
        ? h.categorias.map((x) => ({ valor: x.id, etiqueta: x.nombre }))
        : alcance === 'medio_pago'
          ? h.medios_pago.filter((x) => x.activo).map((x) => ({ valor: x.id, etiqueta: x.nombre }))
          : h.subcategorias.filter((x) => x.activo).map((x) => ({ valor: x.id, etiqueta: nombreAlcance(h, 'subcategoria', x.id) }))
  return lista.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

/** Ámbitos, categoría y subcategoría a los que pertenece un alcance (para detectar solapes). */
function cobertura(h: Hojas, alcance: Alcance, id: string) {
  const ambitos = new Set<string>()
  const categorias = new Set<string>()
  const subs = new Set<string>()
  if (alcance === 'ambito') ambitos.add(id)
  else if (alcance === 'categoria') {
    categorias.add(id)
    for (const v of h.ambito_categoria) if (v.categoria_id === id) ambitos.add(v.ambito_id)
  } else if (alcance === 'subcategoria') {
    subs.add(id)
    const s = h.subcategorias.find((x) => x.id === id)
    if (s) {
      categorias.add(s.categoria_id)
      for (const v of h.ambito_categoria) if (v.categoria_id === s.categoria_id) ambitos.add(v.ambito_id)
    }
  }
  return { ambitos, categorias, subs }
}

const hayInterseccion = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x))

/**
 * Otras cajas activas que comparten gastos con el alcance elegido. Un gasto cuenta solo en la caja más específica
 * (subcategoría > categoría > ámbito > medio), así que es un aviso, no un error.
 */
export function cajasSolapadas(h: Hojas, alcance: Alcance, alcanceId: string, excluirId?: string): Caja[] {
  if (!alcanceId) return []
  const mia = cobertura(h, alcance, alcanceId)
  return h.cajas.filter((c) => {
    if (!c.activo || c.id === excluirId) return false
    if (c.alcance === alcance && c.alcance_id === alcanceId) return true
    if (c.alcance === 'medio_pago' || alcance === 'medio_pago') return true
    const otra = cobertura(h, c.alcance, c.alcance_id)
    if (c.alcance === alcance) return false
    return hayInterseccion(mia.subs, otra.subs) || hayInterseccion(mia.categorias, otra.categorias) || (alcance === 'ambito' ? hayInterseccion(mia.ambitos, otra.ambitos) : c.alcance === 'ambito' && hayInterseccion(mia.ambitos, otra.ambitos))
  })
}

/* ---------- Estado de caja ---------- */

export const TEXTO_ESTADO_CAJA: Record<CajaCalculada['estado'], string> = { al_dia: 'Al día', atencion: 'Atención', critico: 'Crítico', excedida: 'Excedida' }

export function pctDeUso(asignado: number, gastado: number): number | null {
  return asignado > 0 ? (gastado / asignado) * 100 : null
}

export function etiquetaEstadoCaja(c: Pick<CajaCalculada, 'estado' | 'asignado' | 'gastado'>): string {
  if (c.estado !== 'excedida') return TEXTO_ESTADO_CAJA[c.estado]
  const pct = pctDeUso(c.asignado, c.gastado)
  return pct === null ? 'Excedida' : `Excedida ${Math.round(pct)} %`
}

export interface FilaCaja {
  caja: Caja
  estadoMes: EstadoMes
  /** Solo si está aplicada y activa este mes. */
  calculo: CajaCalculada | null
  montoMes: number | null
  etiquetaAlcance: string
}

export type OrdenCajas = 'manual' | 'nombre' | 'monto' | 'uso' | 'gastadas'
export interface FiltroCajas {
  texto: string
  alcance: Alcance | ''
  estado: '' | 'activas' | 'inactivas'
  orden: OrdenCajas
}

export function filasDeCajas(h: Hojas, r: ResultadoPresupuesto, mes: string): FilaCaja[] {
  return h.cajas.map((caja) => {
    const e = estadoEnMes(h.cajas_mes, 'caja_id', caja.id, mes)
    return { caja, estadoMes: e.estado, calculo: r.cajas.find((c) => c.caja.id === caja.id) ?? null, montoMes: e.monto, etiquetaAlcance: nombreAlcance(h, caja.alcance, caja.alcance_id) }
  })
}

export function filtrarCajas(filas: FilaCaja[], f: FiltroCajas): FilaCaja[] {
  const q = normalizarBusqueda(f.texto)
  const salida = filas.filter((x) => {
    if (q && !normalizarBusqueda(`${x.caja.nombre} ${x.etiquetaAlcance}`).includes(q)) return false
    if (f.alcance && x.caja.alcance !== f.alcance) return false
    if (f.estado === 'activas' && !x.caja.activo) return false
    if (f.estado === 'inactivas' && x.caja.activo) return false
    return true
  })
  const porNombre = (a: FilaCaja, b: FilaCaja) => a.caja.nombre.localeCompare(b.caja.nombre, 'es')
  const monto = (x: FilaCaja) => x.calculo?.asignado ?? Math.round((x.montoMes ?? x.caja.monto_defecto) * 100)
  const uso = (x: FilaCaja) => x.calculo?.pct ?? (x.calculo && x.calculo.gastado > 0 ? Infinity : -1)
  switch (f.orden) {
    case 'nombre':
      return salida.sort(porNombre)
    case 'monto':
      return salida.sort((a, b) => monto(b) - monto(a) || porNombre(a, b))
    case 'uso':
      return salida.sort((a, b) => uso(b) - uso(a) || porNombre(a, b))
    case 'gastadas':
      return salida.sort((a, b) => (b.calculo?.gastado ?? 0) - (a.calculo?.gastado ?? 0) || porNombre(a, b))
    default:
      return salida.sort((a, b) => a.caja.orden - b.caja.orden)
  }
}

/* ---------- Copiar del mes anterior (misma regla que el backend) ---------- */

export interface FilaCopia {
  tipo: 'fuente' | 'caja'
  id: string
  nombre: string
  montoAnterior: number
  monto: number
  accion: 'crear' | 'existente' | 'omitir'
}

export function previsualizarCopia(h: Hojas, mes: string, excluir: ReadonlySet<string> = new Set(), montos: Readonly<Record<string, number>> = {}): FilaCopia[] {
  const ant = sumarMeses(mes, -1)
  const filas: FilaCopia[] = []
  for (const r of h.fuentes_mes) {
    if (r.mes !== ant || r.estado !== 'aplicada') continue
    const f = h.fuentes.find((x) => x.id === r.fuente_id)
    if (!f || !f.activo || f.recurrencia !== 'mensual' || !fuenteVigente(f, mes)) continue
    const clave = `fuente:${f.id}`
    const ya = h.fuentes_mes.some((x) => x.fuente_id === f.id && x.mes === mes)
    filas.push({ tipo: 'fuente', id: f.id, nombre: f.nombre, montoAnterior: r.monto, monto: montos[clave] ?? r.monto, accion: ya ? 'existente' : excluir.has(clave) ? 'omitir' : 'crear' })
  }
  for (const r of h.cajas_mes) {
    if (r.mes !== ant || r.estado !== 'aplicada') continue
    const c = h.cajas.find((x) => x.id === r.caja_id)
    if (!c || !c.activo) continue
    const clave = `caja:${c.id}`
    const ya = h.cajas_mes.some((x) => x.caja_id === c.id && x.mes === mes)
    filas.push({ tipo: 'caja', id: c.id, nombre: c.nombre, montoAnterior: r.monto, monto: montos[clave] ?? r.monto, accion: ya ? 'existente' : excluir.has(clave) ? 'omitir' : 'crear' })
  }
  return filas
}

/* ---------- Plantillas mensuales (fuente / caja) ---------- */

export type AccionPlantilla = 'crear' | 'actualizar' | 'sin_cambios' | 'omitir'
export type EstadoPlantilla = 'pendiente' | 'aplicada' | 'no_aplica'
export interface FilaPlantilla {
  plantillaId: string
  nombre: string
  entidadId: string
  monto: number | null
  accion: AccionPlantilla
  estado: EstadoPlantilla
  motivo: string
}

/** Vista previa de aplicar plantillas de fuente o caja a un mes. Idéntica a `plantilla.aplicarMes` con `previsualizar`. */
export function previsualizarPlantillas(h: Hojas, tipo: 'fuente' | 'caja', mes: string, omitirIds: ReadonlySet<string> = new Set(), montos: Readonly<Record<string, number>> = {}, ids?: readonly string[]): FilaPlantilla[] {
  const salida: FilaPlantilla[] = []
  const lista = h.plantillas.filter((p) => p.tipo === tipo && p.activo && (!ids || ids.includes(p.id))).sort((a, b) => a.orden - b.orden)
  for (const pl of lista) {
    const d = (pl.datos_json ?? {}) as Record<string, unknown>
    const entId = String(tipo === 'fuente' ? d['fuente_id'] : d['caja_id'])
    const ent = tipo === 'fuente' ? h.fuentes.find((x) => x.id === entId) : h.cajas.find((x) => x.id === entId)
    const fila: FilaPlantilla = { plantillaId: pl.id, nombre: pl.nombre, entidadId: entId, monto: null, accion: 'omitir', estado: 'pendiente', motivo: '' }
    if (!ent || !ent.activo) {
      fila.motivo = `La ${tipo} está inactiva o ya no existe.`
      salida.push(fila)
      continue
    }
    if (tipo === 'fuente' && !fuenteVigente(ent as Fuente, mes)) {
      fila.motivo = `La fuente no está vigente en ${mes}.`
      salida.push(fila)
      continue
    }
    const monto = montos[pl.id] ?? (typeof d['monto'] === 'number' ? d['monto'] : ent.monto_defecto)
    fila.monto = monto
    const ex = (tipo === 'fuente' ? h.fuentes_mes : h.cajas_mes).find((r) => (tipo === 'fuente' ? (r as FuenteMes).fuente_id : (r as CajaMes).caja_id) === entId && r.mes === mes)
    if (omitirIds.has(pl.id)) {
      fila.accion = 'omitir'
      fila.estado = 'no_aplica'
    } else if (!ex) fila.accion = 'crear'
    else if (ex.estado === 'aplicada' && ex.monto === monto) {
      fila.accion = 'sin_cambios'
      fila.estado = 'aplicada'
    } else fila.accion = 'actualizar'
    if (ex && ex.estado === 'omitida' && fila.accion !== 'omitir') fila.estado = 'no_aplica'
    salida.push(fila)
  }
  return salida
}

export const TEXTO_ACCION: Record<AccionPlantilla, string> = { crear: 'Crear', actualizar: 'Actualizar', sin_cambios: 'Sin cambios', omitir: 'Omitir' }
export const TEXTO_ESTADO_PLANTILLA: Record<EstadoPlantilla, string> = { pendiente: 'Pendiente', aplicada: 'Aplicada', no_aplica: 'No aplica este mes' }
