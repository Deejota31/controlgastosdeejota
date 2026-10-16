import type { Hojas } from '@/api/esquemas'
import { calcularPanel, presupuestoPeriodo, type Panel, type ResumenPresupuestoPeriodo } from '@/engine/panel'
import { formatoMoneda, formatoPct } from '@/engine/dinero'
import { mesesCompletos } from '@/engine/periodo'
import { sumarMeses } from '@/engine/fechas'
import { prepararMovimientos } from '@/engine/movimientos'
import { filtrosAMotor, type FiltrosGlobales } from '@/lib/filtros'
import { colorDe } from '@/components/graficos/colores'
import type { DatoGrafico } from '@/components/graficos/Graficos'
import type { DatosMotor } from '@/engine/tipos'

export interface DatosInicio {
  panel: Panel
  filtro: ReturnType<typeof filtrosAMotor>
  /** Presupuesto de los meses inmediatamente anteriores (misma cantidad de meses); null si el período no son meses completos. */
  presupuestoPrevio: ResumenPresupuestoPeriodo | null
  base: string
}

export function primeraFechaDe(h: Pick<Hojas, 'movimientos'>): string | undefined {
  let min: string | undefined
  for (const m of h.movimientos) if (m.estado === 'activo' && (!min || m.fecha < min)) min = m.fecha
  return min
}

/** Todo lo que pinta Inicio, calculado con el motor único (misma fuente que Movimientos y Presupuesto). */
export function calcularInicio(h: Hojas, config: Record<string, string>, f: FiltrosGlobales, hoy: string): DatosInicio {
  const d: DatosMotor = { ...h, config }
  const filtro = filtrosAMotor(f, hoy, primeraFechaDe(h))
  const panel = calcularPanel(d, filtro, hoy)
  const meses = mesesCompletos(filtro)
  const previos = meses ? meses.map((m) => sumarMeses(m, -meses.length)) : null
  const presupuestoPrevio = previos ? presupuestoPeriodo(d, prepararMovimientos(h.movimientos), previos) : null
  return { panel, filtro, presupuestoPrevio, base: (config['moneda_base'] || 'PEN').toUpperCase() }
}

/** El mes no tiene fuentes ni cajas aplicadas: el presupuesto está sin configurar. */
export const mesSinConfigurar = (p: Panel): boolean => !!p.presupuesto && p.presupuesto.meses.length === 1 && p.presupuesto.presupuesto === 0 && p.presupuesto.reservado === 0

export interface SegmentoResumen {
  clave: 'gastado' | 'reservado' | 'libre'
  etiqueta: string
  valor: number
  pct: number
}

/** Barra segmentada del presupuesto: Gastado + Reservado sin usar + Saldo libre (= P cuando no hay exceso). */
export function segmentosResumen(r: ResumenPresupuestoPeriodo): SegmentoResumen[] {
  const base = Math.max(r.presupuesto, r.gastado, 1)
  const partes: Array<[SegmentoResumen['clave'], string, number]> = [
    ['gastado', 'Gastado', r.gastado],
    ['reservado', 'Reservado sin usar', r.reservasSinUsar],
    ['libre', 'Saldo libre', Math.max(0, r.saldoLibre)],
  ]
  return partes.map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, pct: (valor / base) * 100 }))
}

export interface KpiVista {
  clave: string
  titulo: string
  valor: string
  ayuda: string
  variacion?: { texto: string; tono: 'ok' | 'danger' | 'neutro' }
}

function variacion(actual: number, previo: number | null | undefined, sube: 'malo' | 'bueno' | 'neutro'): KpiVista['variacion'] {
  if (previo === null || previo === undefined || previo <= 0) return { texto: 'Sin mes anterior para comparar', tono: 'neutro' }
  const v = (actual - previo) / previo
  const signo = v > 0 ? '+' : v < 0 ? '−' : ''
  const texto = `${signo}${formatoPct(Math.abs(v), 0)} vs mes anterior`
  if (Math.abs(v) < 0.005) return { texto: 'Igual que el mes anterior', tono: 'neutro' }
  if (sube === 'neutro') return { texto, tono: 'neutro' }
  const bueno = sube === 'malo' ? v < 0 : v > 0
  return { texto, tono: bueno ? 'ok' : 'danger' }
}

/** Los 8 KPIs del contrato, con ⓘ y variación frente al mes anterior. */
export function kpisInicio(di: DatosInicio): KpiVista[] {
  const { panel, presupuestoPrevio, base } = di
  const p = panel.presupuesto
  const pp = presupuestoPrevio
  const m = (c: number) => formatoMoneda(c, base)
  const k = panel.kpis
  const sinPresupuesto = 'El presupuesto se calcula por meses completos; elige un mes o un rango de meses.'
  return [
    { clave: 'presupuesto', titulo: 'Presupuesto', valor: p ? m(p.presupuesto) : '—', ayuda: 'Suma de las fuentes de ingreso aplicadas al período (P). ' + (p ? '' : sinPresupuesto), variacion: p ? variacion(p.presupuesto, pp?.presupuesto, 'neutro') : undefined },
    { clave: 'gastado', titulo: 'Gastado', valor: m(k.gastado.valor), ayuda: 'Suma de los movimientos activos del período, convertidos a la moneda base. Los anulados no suman.', variacion: variacion(k.gastado.valor, k.gastado.previo, 'malo') },
    { clave: 'disponible', titulo: 'Disponible', valor: p ? m(p.disponible) : '—', ayuda: 'Lo que queda del presupuesto: reservas sin usar + saldo libre. Es negativo si te pasaste.', variacion: p ? variacion(p.disponible, pp?.disponible, 'bueno') : undefined },
    { clave: 'consumido', titulo: '% consumido', valor: p ? formatoPct(p.pctConsumido, 0) : '—', ayuda: 'Gastado entre presupuesto. Pasa de 100 % cuando gastas más de lo presupuestado.', variacion: p && p.pctConsumido !== null && pp?.pctConsumido != null ? variacion(p.pctConsumido, pp.pctConsumido, 'malo') : p ? { texto: 'Sin mes anterior para comparar', tono: 'neutro' } : undefined },
    { clave: 'promedio', titulo: 'Promedio diario', valor: m(k.promedioDiario.valor), ayuda: `Gastado dividido entre los días transcurridos (${k.diasTranscurridos}).`, variacion: variacion(k.promedioDiario.valor, k.promedioDiario.previo, 'malo') },
    { clave: 'ticket', titulo: 'Ticket promedio', valor: m(k.ticketPromedio.valor), ayuda: 'Gastado dividido entre el número de movimientos.', variacion: variacion(k.ticketPromedio.valor, k.ticketPromedio.previo, 'malo') },
    { clave: 'mayor', titulo: 'Mayor gasto', valor: m(k.mayorGasto.valor), ayuda: 'El movimiento individual más grande del período.', variacion: variacion(k.mayorGasto.valor, k.mayorGasto.previo, 'malo') },
    { clave: 'movimientos', titulo: 'Movimientos', valor: String(k.movimientos.valor), ayuda: 'Cantidad de movimientos activos con tipo de cambio en el período.', variacion: variacion(k.movimientos.valor, k.movimientos.previo, 'neutro') },
  ]
}

type Cat = Pick<Hojas, 'ambitos' | 'categorias' | 'subcategorias' | 'medios_pago'>
export interface Rotulos {
  nombre: (tipo: 'ambito' | 'categoria' | 'subcategoria' | 'medio', id: string) => string
  color: (tipo: 'ambito' | 'categoria' | 'subcategoria' | 'medio', id: string) => string
}
export function rotulosDe(h: Cat): Rotulos {
  const listas = { ambito: h.ambitos, categoria: h.categorias, subcategoria: h.subcategorias, medio: h.medios_pago } as const
  const idx = (tipo: keyof typeof listas) => new Map<string, { nombre: string; color: string; i: number }>(listas[tipo].map((x, i) => [x.id, { nombre: x.nombre, color: 'color' in x ? (x as { color: string }).color : '', i }]))
  const mapas = { ambito: idx('ambito'), categoria: idx('categoria'), subcategoria: idx('subcategoria'), medio: idx('medio') }
  return {
    nombre: (t, id) => mapas[t].get(id)?.nombre ?? '—',
    color: (t, id) => colorDe(mapas[t].get(id)?.color, mapas[t].get(id)?.i ?? 0),
  }
}

export function datosDonut(panel: Panel, r: Rotulos, base: string): DatoGrafico[] {
  return panel.porAmbito.map((g) => ({ id: g.id, etiqueta: r.nombre('ambito', g.id), valor: g.total, color: r.color('ambito', g.id), texto: formatoMoneda(g.total, base) }))
}

export function topN(panel: Panel, dim: 'categoria' | 'subcategoria', r: Rotulos, base: string, n = 5) {
  const fuente = dim === 'categoria' ? panel.porCategoria : panel.porSubcategoria
  const total = panel.totales.total
  return fuente.slice(0, n).map((g) => ({ id: g.id, etiqueta: r.nombre(dim, g.id), total: g.total, texto: formatoMoneda(g.total, base), pct: total > 0 ? g.total / total : 0, color: r.color(dim, g.id) }))
}
