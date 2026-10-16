import { aplicarFiltro, agruparPor, cuenta, totales, prepararMovimientos, type Agrupado, type Totales } from './movimientos'
import { calcularPresupuestoMes, UMBRALES_DEFECTO, type CajaCalculada, type FuenteCalculada, type ResultadoPresupuesto } from './presupuesto'
import { calcularKpis, type KpisMes } from './kpis'
import { serieDiariaMes, type SerieMes } from './serie'
import { mesesCompletos } from './periodo'

import type { DatosMotor, Filtro, MovC } from './tipos'

export interface NodoJerarquia {
  tipo: 'ambito' | 'categoria' | 'subcategoria'
  id: string
  total: number
  cantidad: number
  /** Peso sobre el total del período (0..1). */
  peso: number
  hijos: NodoJerarquia[]
}
export interface EnlaceFlujo {
  medio: string
  ambito: string
  total: number
}
export interface Burbuja {
  id: string
  frecuencia: number
  total: number
  promedio: number
}

export interface ResumenPresupuestoPeriodo {
  meses: string[]
  presupuesto: number
  reservado: number
  libreInicial: number
  gastoEnCajas: number
  gastoFueraDeCajas: number
  exceso: number
  saldoLibre: number
  disponible: number
  reservasSinUsar: number
  gastado: number
  pctConsumido: number | null
  cajas: CajaCalculada[]
  fuentes: FuenteCalculada[]
  sinFuente: number
  porMes: ResultadoPresupuesto[]
}

export interface Panel {
  filtro: Filtro
  movimientos: MovC[]
  totales: Totales
  kpis: KpisMes
  /** null si el período no cubre meses completos (el presupuesto es mensual). */
  presupuesto: ResumenPresupuestoPeriodo | null
  /** Solo cuando el período es un único mes completo. */
  serie: SerieMes | null
  porAmbito: Agrupado[]
  porCategoria: Agrupado[]
  porSubcategoria: Agrupado[]
  porMedio: Agrupado[]
  jerarquia: NodoJerarquia[]
  flujo: EnlaceFlujo[]
  burbujas: Burbuja[]
  avisos: { sinTipoCambio: string[]; fuentesSinTipoCambio: string[]; solapamientos: ResultadoPresupuesto['avisos']['solapamientos'] }
}

export function tiposDeCambio(config: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(config)) {
    if (k.startsWith('tipo_cambio_')) {
      const n = Number(v)
      if (n > 0) out[k.slice('tipo_cambio_'.length)] = n
    }
  }
  return out
}

export function umbralesDe(config: Record<string, string>) {
  const [a, c, e] = (config['umbral_alertas'] ?? '70,90,100').split(',').map((x) => Number(x) / 100)
  return a && c && e ? { atencion: a, critico: c, excedida: e } : UMBRALES_DEFECTO
}

/** Presupuesto del período: suma mes a mes (la asignación a cajas se resuelve dentro de cada mes). */
export function presupuestoPeriodo(d: DatosMotor, movs: readonly MovC[], meses: string[]): ResumenPresupuestoPeriodo {
  const base = d.config['moneda_base'] || 'PEN'
  const tc = tiposDeCambio(d.config)
  const um = umbralesDe(d.config)
  const porMes = meses.map((mes) =>
    calcularPresupuestoMes({ mes, movs, fuentes: d.fuentes, fuentesMes: d.fuentes_mes, fuenteMedios: d.fuente_medios, cajas: d.cajas, cajasMes: d.cajas_mes, monedaBase: base, tiposCambio: tc }, um),
  )
  const suma = (f: (r: ResultadoPresupuesto) => number) => porMes.reduce((s, r) => s + f(r), 0)
  const cajas = new Map<string, CajaCalculada>()
  const fuentes = new Map<string, FuenteCalculada>()
  for (const r of porMes) {
    for (const c of r.cajas) {
      const p = cajas.get(c.caja.id)
      const asignado = (p?.asignado ?? 0) + c.asignado
      const gastado = (p?.gastado ?? 0) + c.gastado
      const pct = asignado > 0 ? gastado / asignado : null
      cajas.set(c.caja.id, { caja: c.caja, asignado, gastado, disponible: asignado - gastado, exceso: (p?.exceso ?? 0) + c.exceso, pct, estado: gastado > asignado ? 'excedida' : c.estado })
    }
    for (const f of r.fuentes) {
      const p = fuentes.get(f.fuente.id)
      fuentes.set(f.fuente.id, { fuente: f.fuente, asignado: (p?.asignado ?? 0) + f.asignado, consumido: (p?.consumido ?? 0) + f.consumido, restante: (p?.restante ?? 0) + f.restante })
    }
  }
  const presupuesto = suma((r) => r.presupuesto)
  const gastado = suma((r) => r.gastado)
  return {
    meses, presupuesto, reservado: suma((r) => r.reservado), libreInicial: suma((r) => r.libreInicial), gastoEnCajas: suma((r) => r.gastoEnCajas),
    gastoFueraDeCajas: suma((r) => r.gastoFueraDeCajas), exceso: suma((r) => r.exceso), saldoLibre: suma((r) => r.saldoLibre), disponible: suma((r) => r.disponible),
    reservasSinUsar: suma((r) => r.reservasSinUsar), gastado, pctConsumido: presupuesto > 0 ? gastado / presupuesto : null,
    cajas: [...cajas.values()], fuentes: [...fuentes.values()], sinFuente: suma((r) => r.sinFuente), porMes,
  }
}

export function construirJerarquia(movs: readonly MovC[]): NodoJerarquia[] {
  const total = movs.reduce((s, m) => (cuenta(m) ? s + m.cents : s), 0)
  const ambitos = new Map<string, Map<string, Map<string, Agrupado>>>()
  for (const m of movs) {
    if (!cuenta(m)) continue
    const a = ambitos.get(m.ambito) ?? new Map<string, Map<string, Agrupado>>()
    const c = a.get(m.categoria) ?? new Map<string, Agrupado>()
    const s = c.get(m.sub) ?? { id: m.sub, total: 0, cantidad: 0 }
    s.total += m.cents
    s.cantidad++
    c.set(m.sub, s)
    a.set(m.categoria, c)
    ambitos.set(m.ambito, a)
  }
  const peso = (t: number) => (total > 0 ? t / total : 0)
  const out: NodoJerarquia[] = []
  for (const [aid, cats] of ambitos) {
    const hijosA: NodoJerarquia[] = []
    for (const [cid, subs] of cats) {
      const hijosC: NodoJerarquia[] = [...subs.values()]
        .sort((x, y) => y.total - x.total || (x.id < y.id ? -1 : 1))
        .map((s) => ({ tipo: 'subcategoria' as const, id: s.id, total: s.total, cantidad: s.cantidad, peso: peso(s.total), hijos: [] }))
      const t = hijosC.reduce((x, h) => x + h.total, 0)
      hijosA.push({ tipo: 'categoria', id: cid, total: t, cantidad: hijosC.reduce((x, h) => x + h.cantidad, 0), peso: peso(t), hijos: hijosC })
    }
    hijosA.sort((x, y) => y.total - x.total || (x.id < y.id ? -1 : 1))
    const t = hijosA.reduce((x, h) => x + h.total, 0)
    out.push({ tipo: 'ambito', id: aid, total: t, cantidad: hijosA.reduce((x, h) => x + h.cantidad, 0), peso: peso(t), hijos: hijosA })
  }
  return out.sort((x, y) => y.total - x.total || (x.id < y.id ? -1 : 1))
}

export function construirFlujo(movs: readonly MovC[]): EnlaceFlujo[] {
  const mapa = new Map<string, EnlaceFlujo>()
  for (const m of movs) {
    if (!cuenta(m)) continue
    const k = `${m.medio}|${m.ambito}`
    const e = mapa.get(k)
    if (e) e.total += m.cents
    else mapa.set(k, { medio: m.medio, ambito: m.ambito, total: m.cents })
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || (a.medio + a.ambito < b.medio + b.ambito ? -1 : 1))
}

export function construirBurbujas(porGrupo: readonly Agrupado[]): Burbuja[] {
  return porGrupo.map((g) => ({ id: g.id, frecuencia: g.cantidad, total: g.total, promedio: g.cantidad ? Math.round(g.total / g.cantidad) : 0 }))
}

/** Todo lo que necesitan Inicio, Movimientos y Presupuesto, calculado desde una sola fuente de verdad. */
export function calcularPanel(d: DatosMotor, filtro: Filtro, hoy: string): Panel {
  const todos = prepararMovimientos(d.movimientos)
  const movimientos = aplicarFiltro(todos, filtro)
  const meses = mesesCompletos(filtro)
  const presupuesto = meses ? presupuestoPeriodo(d, todos, meses) : null
  const t = totales(movimientos)
  const unMes = meses && meses.length === 1 ? meses[0]! : null
  const porSubcategoria = agruparPor(movimientos, (m) => m.sub)
  const porCategoria = agruparPor(movimientos, (m) => m.categoria)
  return {
    filtro,
    movimientos,
    totales: t,
    kpis: calcularKpis(todos, filtro, hoy),
    presupuesto,
    serie: unMes ? serieDiariaMes(movimientos, unMes, hoy, presupuesto?.presupuesto ?? 0) : null,
    porAmbito: agruparPor(movimientos, (m) => m.ambito),
    porCategoria,
    porSubcategoria,
    porMedio: agruparPor(movimientos, (m) => m.medio),
    jerarquia: construirJerarquia(movimientos),
    flujo: construirFlujo(movimientos),
    burbujas: construirBurbujas(porCategoria),
    avisos: {
      sinTipoCambio: movimientos.filter((m) => !m.anulado && m.cents === null).map((m) => m.id),
      fuentesSinTipoCambio: presupuesto ? [...new Set(presupuesto.porMes.flatMap((r) => r.avisos.fuentesSinTipoCambio))] : [],
      solapamientos: presupuesto?.porMes[0]?.avisos.solapamientos ?? [],
    },
  }
}

