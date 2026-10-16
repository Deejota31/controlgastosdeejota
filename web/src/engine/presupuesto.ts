import type { Caja, CajaMes, Fuente, FuenteMedio, FuenteMes } from '@/api/esquemas'
import { aCentimos, convertirCentimos } from './dinero'
import type { Avisos, MovC } from './tipos'
import { cuenta } from './movimientos'

export interface EntradaPresupuesto {
  mes: string
  /** Movimientos ya preparados (todos los del libro; se filtra por mes aquí). */
  movs: readonly MovC[]
  fuentes: readonly Fuente[]
  fuentesMes: readonly FuenteMes[]
  fuenteMedios: readonly FuenteMedio[]
  cajas: readonly Caja[]
  cajasMes: readonly CajaMes[]
  monedaBase: string
  /** Tipos de cambio por moneda a la base (tipo_cambio_USD → 3.75). La base vale 1. */
  tiposCambio: Record<string, number>
}

export interface CajaCalculada {
  caja: Caja
  asignado: number
  gastado: number
  /** Puede ser negativo. */
  disponible: number
  exceso: number
  pct: number | null
  estado: 'al_dia' | 'atencion' | 'critico' | 'excedida'
}

export interface FuenteCalculada {
  fuente: Fuente
  asignado: number
  consumido: number
  restante: number
}

export interface ResultadoPresupuesto {
  mes: string
  /** Presupuesto del mes (P). */
  presupuesto: number
  /** Reservado en cajas (R). */
  reservado: number
  libreInicial: number
  gastoEnCajas: number
  gastoFueraDeCajas: number
  exceso: number
  saldoLibre: number
  disponible: number
  /** Reservas sin usar = Σ max(0, asignado − gastado). */
  reservasSinUsar: number
  gastado: number
  pctConsumido: number | null
  cajas: CajaCalculada[]
  fuentes: FuenteCalculada[]
  /** Gasto que ninguna fuente alcanzó a cubrir. */
  sinFuente: number
  /** caja asignada a cada movimiento (id → cajaId o null = fuera de cajas). */
  asignacion: Map<string, string | null>
  avisos: Pick<Avisos, 'fuentesSinTipoCambio' | 'solapamientos'>
}

export const UMBRALES_DEFECTO = { atencion: 0.7, critico: 0.9, excedida: 1 }

export function estadoCaja(pct: number | null, umbrales = UMBRALES_DEFECTO): CajaCalculada['estado'] {
  if (pct === null) return 'al_dia'
  if (pct > umbrales.excedida) return 'excedida'
  if (pct >= umbrales.critico) return 'critico'
  if (pct >= umbrales.atencion) return 'atencion'
  return 'al_dia'
}

const NIVEL = { subcategoria: 0, categoria: 1, ambito: 2, medio_pago: 3 } as const

export function calcularPresupuestoMes(e: EntradaPresupuesto, umbrales = UMBRALES_DEFECTO): ResultadoPresupuesto {
  const avisos: ResultadoPresupuesto['avisos'] = { fuentesSinTipoCambio: [], solapamientos: [] }
  const convertir = (monto: number, moneda: string): number | null =>
    moneda === e.monedaBase ? aCentimos(monto) : convertirCentimos(monto, e.tiposCambio[moneda] ?? null)

  /* --- Fuentes: solo lo aplicado en ESTE mes, de fuentes activas (aislamiento total) --- */
  const fuentePorId = new Map(e.fuentes.map((f) => [f.id, f]))
  const montoFuente = new Map<string, number>()
  for (const fm of e.fuentesMes) {
    if (fm.mes !== e.mes || fm.estado !== 'aplicada') continue
    const f = fuentePorId.get(fm.fuente_id)
    if (!f || !f.activo) continue
    const c = convertir(fm.monto, f.moneda)
    if (c === null) {
      avisos.fuentesSinTipoCambio.push(f.id)
      continue
    }
    montoFuente.set(f.id, (montoFuente.get(f.id) ?? 0) + c)
  }
  let presupuesto = 0
  for (const v of montoFuente.values()) presupuesto += v

  /* --- Cajas: aplicadas en el mes, de cajas activas --- */
  const cajaPorId = new Map(e.cajas.map((c) => [c.id, c]))
  const asignado = new Map<string, number>()
  for (const cm of e.cajasMes) {
    if (cm.mes !== e.mes || cm.estado !== 'aplicada') continue
    const c = cajaPorId.get(cm.caja_id)
    if (!c || !c.activo) continue
    asignado.set(c.id, (asignado.get(c.id) ?? 0) + aCentimos(cm.monto))
  }
  let reservado = 0
  for (const v of asignado.values()) reservado += v

  // Solapamientos: dos cajas activas con el mismo alcance
  const porAlcance = new Map<string, string[]>()
  for (const c of e.cajas) {
    if (!c.activo) continue
    const k = `${c.alcance}|${c.alcance_id}`
    porAlcance.set(k, [...(porAlcance.get(k) ?? []), c.id])
  }
  for (const [k, ids] of porAlcance) {
    if (ids.length > 1) {
      const [alcance = '', alcanceId = ''] = k.split('|')
      avisos.solapamientos.push({ alcance, alcanceId, cajaIds: ids })
    }
  }

  /* --- Asignación de cada movimiento a UNA caja: la más específica; a igual nivel gana el orden manual --- */
  const cajasDelMes = [...asignado.keys()].map((id) => cajaPorId.get(id)!).sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1))
  const indice: Record<'subcategoria' | 'categoria' | 'ambito' | 'medio_pago', Map<string, Caja>> = {
    subcategoria: new Map(), categoria: new Map(), ambito: new Map(), medio_pago: new Map(),
  }
  for (const c of cajasDelMes) if (!indice[c.alcance].has(c.alcance_id)) indice[c.alcance].set(c.alcance_id, c)

  const gastadoCaja = new Map<string, number>()
  const asignacion = new Map<string, string | null>()
  let gastado = 0
  let fuera = 0
  const delMes: Array<MovC & { cents: number }> = []
  for (const m of e.movs) {
    if (m.mes !== e.mes || !cuenta(m)) continue
    delMes.push(m)
    gastado += m.cents
    const caja =
      (m.sub && indice.subcategoria.get(m.sub)) || indice.categoria.get(m.categoria) || indice.ambito.get(m.ambito) || indice.medio_pago.get(m.medio) || null
    if (caja) {
      gastadoCaja.set(caja.id, (gastadoCaja.get(caja.id) ?? 0) + m.cents)
      asignacion.set(m.id, caja.id)
    } else {
      fuera += m.cents
      asignacion.set(m.id, null)
    }
  }

  const cajas: CajaCalculada[] = cajasDelMes.map((caja) => {
    const a = asignado.get(caja.id) ?? 0
    const g = gastadoCaja.get(caja.id) ?? 0
    const pct = a > 0 ? g / a : g > 0 ? Infinity : null
    return { caja, asignado: a, gastado: g, disponible: a - g, exceso: Math.max(0, g - a), pct: pct === Infinity ? null : pct, estado: g > a ? 'excedida' : estadoCaja(pct, umbrales) }
  })
  let gastoEnCajas = 0, exceso = 0, reservasSinUsar = 0
  for (const c of cajas) {
    gastoEnCajas += c.gastado
    exceso += c.exceso
    reservasSinUsar += Math.max(0, c.asignado - c.gastado)
  }

  const libreInicial = presupuesto - reservado
  const saldoLibre = presupuesto - reservado - fuera - exceso
  const disponible = presupuesto - gastoEnCajas - fuera

  /* --- Atribución por fuente --- */
  const { fuentes, sinFuente } = atribuirFuentes(e, delMes, montoFuente, fuentePorId)

  return {
    mes: e.mes, presupuesto, reservado, libreInicial, gastoEnCajas, gastoFueraDeCajas: fuera, exceso, saldoLibre, disponible, reservasSinUsar,
    gastado, pctConsumido: presupuesto > 0 ? gastado / presupuesto : null, cajas, fuentes, sinFuente, asignacion, avisos,
  }
}

/**
 * Las fuentes ligadas a medios cubren solo los movimientos de esos medios; las libres se consumen en cascada
 * (la principal primero, hasta su tope). Un importe nunca se multiplica ni se divide entre medios.
 */
function atribuirFuentes(
  e: EntradaPresupuesto,
  movs: ReadonlyArray<MovC & { cents: number }>,
  montoFuente: Map<string, number>,
  fuentePorId: Map<string, Fuente>,
): { fuentes: FuenteCalculada[]; sinFuente: number } {
  const ligadas = new Map<string, Set<string>>()
  for (const fm of e.fuenteMedios) {
    if (!montoFuente.has(fm.fuente_id)) continue
    const s = ligadas.get(fm.fuente_id) ?? new Set<string>()
    s.add(fm.medio_pago_id)
    ligadas.set(fm.fuente_id, s)
  }
  const activas = [...montoFuente.keys()].map((id) => fuentePorId.get(id)!).sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1))
  const restante = new Map(activas.map((f) => [f.id, montoFuente.get(f.id) ?? 0]))
  const consumido = new Map(activas.map((f) => [f.id, 0]))
  const libres = activas.filter((f) => !ligadas.has(f.id)).sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden)
  const porMedio = new Map<string, Fuente[]>()
  for (const f of activas) for (const medio of ligadas.get(f.id) ?? []) porMedio.set(medio, [...(porMedio.get(medio) ?? []), f])

  const tomar = (f: Fuente, necesario: number): number => {
    const t = Math.min(necesario, restante.get(f.id) ?? 0)
    if (t > 0) {
      restante.set(f.id, (restante.get(f.id) ?? 0) - t)
      consumido.set(f.id, (consumido.get(f.id) ?? 0) + t)
    }
    return t
  }
  let sinFuente = 0
  const ordenados = [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : 1))
  for (const m of ordenados) {
    let falta = m.cents
    for (const f of porMedio.get(m.medio) ?? []) {
      if (falta <= 0) break
      falta -= tomar(f, falta)
    }
    for (const f of libres) {
      if (falta <= 0) break
      falta -= tomar(f, falta)
    }
    sinFuente += falta
  }
  return {
    fuentes: activas.map((fuente) => ({ fuente, asignado: montoFuente.get(fuente.id) ?? 0, consumido: consumido.get(fuente.id) ?? 0, restante: restante.get(fuente.id) ?? 0 })),
    sinFuente,
  }
}

export { NIVEL as NIVEL_ALCANCE }
