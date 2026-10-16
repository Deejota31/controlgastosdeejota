import type { Ambito, AmbitoCategoria, AmbitoSubcategoria, Caja, Categoria, Plantilla, Revision, Subcategoria } from '@/api/esquemas'
import { esFechaValida } from './fechas'
import type { MovC } from './tipos'

/* ------------------------------ Posibles duplicados ------------------------------ */
export interface GrupoDuplicado {
  /** Clave estable (se guarda como `firma` en revisiones_calidad). */
  firma: string
  movimientoIds: string[]
  estado: 'pendiente' | 'legitimo' | 'duplicado'
}

/** Normalización mínima para comparar descripciones (minúsculas, sin tildes ni espacios repetidos). */
export function claveTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Agrupa con un índice hash: fecha + monto + moneda + subcategoría + descripción normalizada + medio.
 * O(n), sin comparar todos contra todos.
 */
export function detectarDuplicados(movs: readonly MovC[], revisiones: readonly Revision[]): GrupoDuplicado[] {
  const grupos = new Map<string, string[]>()
  for (const m of movs) {
    if (m.anulado) continue
    const k = [m.fecha, Math.round(m.montoOrig * 100), m.moneda, m.sub, claveTexto(m.descripcion), m.medio].join('|')
    const l = grupos.get(k)
    if (l) l.push(m.id)
    else grupos.set(k, [m.id])
  }
  const estados = new Map(revisiones.map((r) => [r.firma, r.estado]))
  const out: GrupoDuplicado[] = []
  for (const [firma, ids] of grupos) {
    if (ids.length < 2) continue
    out.push({ firma, movimientoIds: ids, estado: estados.get(firma) ?? 'pendiente' })
  }
  return out.sort((a, b) => (a.firma < b.firma ? -1 : 1))
}

/* ------------------------------ Calidad de datos (0–100) ------------------------------ */
export interface Dimension {
  clave: 'integridad' | 'clasificacion' | 'consistencia' | 'duplicados'
  peso: number
  /** 0–100. */
  valor: number
  /** Cuántos elementos cumplen / cuántos se evaluaron. */
  buenos: number
  total: number
  problemas: string[]
}

export interface CalidadDatos {
  /** 0–100 (entero). */
  puntaje: number
  dimensiones: Dimension[]
  sinDatos: boolean
  /** Movimientos con algún problema, por tipo, para la pantalla "Revisar datos". */
  incompletos: Array<{ id: string; motivos: string[] }>
  clasificacionInactiva: Array<{ id: string; motivos: string[] }>
}

export interface EntradaCalidad {
  movs: readonly MovC[]
  /** Fecha y descripción en bruto para validar integridad. */
  ambitos: readonly Ambito[]
  categorias: readonly Categoria[]
  subcategorias: readonly Subcategoria[]
  ambitoCategoria: readonly AmbitoCategoria[]
  ambitoSubcategoria: readonly AmbitoSubcategoria[]
  cajas: readonly Caja[]
  plantillas: readonly Plantilla[]
  duplicados: readonly GrupoDuplicado[]
  /** Subcategorías con nombre "Otros"/"Por Clasificar" pueden tener descripción vacía. */
  descripcionOpcionalSub?: ReadonlySet<string>
  mediosActivos: ReadonlySet<string>
}

const pct = (buenos: number, total: number) => (total === 0 ? 100 : (buenos / total) * 100)

export function calcularCalidad(e: EntradaCalidad): CalidadDatos {
  const activos = e.movs.filter((m) => !m.anulado)
  const ambito = new Map(e.ambitos.map((a) => [a.id, a]))
  const cat = new Map(e.categorias.map((c) => [c.id, c]))
  const sub = new Map(e.subcategorias.map((s) => [s.id, s]))
  const vinc = new Map(e.ambitoCategoria.map((r) => [`${r.ambito_id}|${r.categoria_id}`, r]))
  const subOff = new Set(e.ambitoSubcategoria.filter((r) => !r.activo).map((r) => `${r.ambito_id}|${r.subcategoria_id}`))
  const subsPorCat = new Map<string, number>()
  for (const s of e.subcategorias) subsPorCat.set(s.categoria_id, (subsPorCat.get(s.categoria_id) ?? 0) + 1)

  /* 1) Integridad: fecha real, monto > 0 con tipo de cambio, medio, descripción (salvo Otros/Por Clasificar) */
  const incompletos: CalidadDatos['incompletos'] = []
  let integros = 0
  for (const m of activos) {
    const motivos: string[] = []
    if (!esFechaValida(m.fecha)) motivos.push('Fecha inválida')
    if (m.cents === null) motivos.push('Falta el tipo de cambio')
    else if (m.cents <= 0) motivos.push('Monto inválido')
    if (!m.medio) motivos.push('Sin medio de pago')
    if (!m.descripcion.trim() && !(m.sub && e.descripcionOpcionalSub?.has(m.sub))) motivos.push('Sin descripción')
    if (motivos.length) incompletos.push({ id: m.id, motivos })
    else integros++
  }

  /* 2) Clasificación válida: ámbito/categoría/subcategoría existen, están activos y encajan entre sí */
  const clasificacionInactiva: CalidadDatos['clasificacionInactiva'] = []
  let clasifOk = 0
  for (const m of activos) {
    const motivos: string[] = []
    const a = ambito.get(m.ambito)
    if (!a) motivos.push('El ámbito ya no existe')
    else if (!a.activo) motivos.push('Ámbito inactivo')
    if (!cat.has(m.categoria)) motivos.push('La categoría ya no existe')
    else {
      const v = vinc.get(`${m.ambito}|${m.categoria}`)
      if (!v) motivos.push('La categoría no pertenece al ámbito')
      else if (!v.activo) motivos.push('Categoría inactiva en este ámbito')
    }
    if (m.sub) {
      const s = sub.get(m.sub)
      if (!s) motivos.push('La subcategoría ya no existe')
      else {
        if (s.categoria_id !== m.categoria) motivos.push('La subcategoría no pertenece a la categoría')
        if (!s.activo) motivos.push('Subcategoría inactiva')
        else if (subOff.has(`${m.ambito}|${m.sub}`)) motivos.push('Subcategoría desactivada en este ámbito')
      }
    } else if ((subsPorCat.get(m.categoria) ?? 0) > 0) motivos.push('Falta la subcategoría')
    if (motivos.length) clasificacionInactiva.push({ id: m.id, motivos })
    else clasifOk++
  }

  /* 3) Consistencia del catálogo: comprobaciones estructurales que deben cumplirse */
  const problemasCat: string[] = []
  let checks = 0
  const falla = (txt: string) => {
    problemasCat.push(txt)
  }
  const nombres = new Set<string>()
  for (const c of e.categorias) {
    checks++
    const k = claveTexto(c.nombre)
    if (nombres.has(k)) falla(`Categoría repetida: ${c.nombre}`)
    nombres.add(k)
    checks++
    if (!e.ambitoCategoria.some((r) => r.categoria_id === c.id)) falla(`La categoría "${c.nombre}" no está en ningún ámbito`)
  }
  const hijos = new Map<string, Set<string>>()
  for (const s of e.subcategorias) {
    checks++
    const set = hijos.get(s.categoria_id) ?? new Set<string>()
    const k = claveTexto(s.nombre)
    if (set.has(k)) falla(`Subcategoría repetida: ${s.nombre}`)
    set.add(k)
    hijos.set(s.categoria_id, set)
    checks++
    if (!cat.has(s.categoria_id)) falla(`La subcategoría "${s.nombre}" apunta a una categoría que no existe`)
  }
  const entidadExiste = (alcance: Caja['alcance'], id: string) =>
    alcance === 'ambito' ? ambito.has(id) : alcance === 'categoria' ? cat.has(id) : alcance === 'subcategoria' ? sub.has(id) : true
  for (const c of e.cajas) {
    if (!c.activo) continue
    checks++
    if (!entidadExiste(c.alcance, c.alcance_id)) falla(`La caja "${c.nombre}" apunta a algo que ya no existe`)
  }
  const vistos = new Set<string>()
  for (const c of e.cajas) {
    if (!c.activo) continue
    checks++
    const k = `${c.alcance}|${c.alcance_id}`
    if (vistos.has(k)) falla(`Cajas solapadas: "${c.nombre}"`)
    vistos.add(k)
  }
  for (const p of e.plantillas) {
    if (p.tipo !== 'gasto' || !p.activo) continue
    checks++
    const d = p.datos_json as { ambito_id?: string; categoria_id?: string; subcategoria_id?: string; medio_pago_id?: string } | null
    const ok =
      !!d && ambito.get(d.ambito_id ?? '')?.activo === true && cat.has(d.categoria_id ?? '') && (!d.subcategoria_id || sub.get(d.subcategoria_id)?.activo === true) && e.mediosActivos.has(d.medio_pago_id ?? '')
    if (!ok) falla(`La plantilla "${p.nombre}" requiere revisión`)
  }

  /* 4) Duplicados resueltos: grupos marcados como legítimo o duplicado confirmado */
  const resueltos = e.duplicados.filter((g) => g.estado !== 'pendiente').length

  const dimensiones: Dimension[] = [
    { clave: 'integridad', peso: 0.3, valor: pct(integros, activos.length), buenos: integros, total: activos.length, problemas: incompletos.map((i) => i.id) },
    { clave: 'clasificacion', peso: 0.3, valor: pct(clasifOk, activos.length), buenos: clasifOk, total: activos.length, problemas: clasificacionInactiva.map((i) => i.id) },
    { clave: 'consistencia', peso: 0.2, valor: pct(checks - problemasCat.length, checks), buenos: checks - problemasCat.length, total: checks, problemas: problemasCat },
    { clave: 'duplicados', peso: 0.2, valor: pct(resueltos, e.duplicados.length), buenos: resueltos, total: e.duplicados.length, problemas: e.duplicados.filter((g) => g.estado === 'pendiente').map((g) => g.firma) },
  ]
  const puntaje = Math.round(dimensiones.reduce((s, d) => s + d.valor * d.peso, 0))
  return { puntaje, dimensiones, sinDatos: activos.length === 0, incompletos, clasificacionInactiva }
}
