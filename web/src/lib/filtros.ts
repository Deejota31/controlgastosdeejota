import { useCallback, useMemo } from 'react'
import { periodoDePreset, moverPeriodo, type PresetPeriodo } from '@/engine/periodo'
import { esFechaValida } from '@/engine/fechas'
import type { Filtro } from '@/engine/tipos'
import { navegar, useRuta } from './router'

/**
 * Filtros globales: viven en la URL (`#/ruta?p=…&a=…`) y se comparten entre Inicio, Movimientos, Presupuesto y Salud.
 * La lectura es estricta: lo que no encaja con la lista blanca o con el formato se descarta en silencio.
 */
export type PresetFiltro = PresetPeriodo | 'todo'
export type TipoGasto = 'fijo' | 'variable' | 'extraordinario'

export interface FiltrosGlobales {
  preset: PresetFiltro
  desde: string
  hasta: string
  ambitos: string[]
  categorias: string[]
  subcategorias: string[]
  medios: string[]
  tipos: TipoGasto[]
  recurrente: 'todos' | 'si' | 'no'
}

export const PRESETS: PresetFiltro[] = ['este_mes', 'mes_anterior', 'ultimos_3', 'ultimos_6', 'ultimos_12', 'este_ano', 'todo', 'personalizado']
export const CLAVES_FILTRO = ['p', 'd', 'h', 'a', 'c', 's', 'm', 't', 'r'] as const
const RE_ID = /^[A-Za-z0-9_-]{1,64}$/
const TIPOS: TipoGasto[] = ['fijo', 'variable', 'extraordinario']
const MAX_IDS = 50

function lista(valor: string | null): string[] {
  if (!valor) return []
  const out: string[] = []
  for (const x of valor.split(',')) if (RE_ID.test(x) && !out.includes(x) && out.length < MAX_IDS) out.push(x)
  return out
}

export function periodoDeFiltros(preset: PresetFiltro, hoy: string, personalizado?: { desde: string; hasta: string }): { desde: string; hasta: string } {
  if (preset === 'todo') return { desde: '', hasta: '' }
  const p = periodoDePreset(preset, hoy, personalizado)
  return { desde: p.desde, hasta: p.hasta }
}

export function filtrosPorDefecto(hoy: string): FiltrosGlobales {
  return { preset: 'este_mes', ...periodoDeFiltros('este_mes', hoy), ambitos: [], categorias: [], subcategorias: [], medios: [], tipos: [], recurrente: 'todos' }
}

export function leerFiltros(params: URLSearchParams, hoy: string): FiltrosGlobales {
  const pRaw = params.get('p')
  let preset: PresetFiltro = PRESETS.includes(pRaw as PresetFiltro) ? (pRaw as PresetFiltro) : 'este_mes'
  let d = params.get('d') ?? ''
  let h = params.get('h') ?? ''
  if (preset === 'personalizado') {
    if (!esFechaValida(d) || !esFechaValida(h) || d > h) preset = 'este_mes'
  } else {
    d = ''
    h = ''
  }
  const rango = periodoDeFiltros(preset, hoy, preset === 'personalizado' ? { desde: d, hasta: h } : undefined)
  const r = params.get('r')
  return {
    preset,
    ...rango,
    ambitos: lista(params.get('a')),
    categorias: lista(params.get('c')),
    subcategorias: lista(params.get('s')),
    medios: lista(params.get('m')),
    tipos: (params.get('t') ?? '').split(',').filter((x): x is TipoGasto => TIPOS.includes(x as TipoGasto)).filter((x, i, a) => a.indexOf(x) === i),
    recurrente: r === 'si' || r === 'no' ? r : 'todos',
  }
}

/** Solo los parámetros que difieren del valor por defecto (la URL de «Este mes» queda limpia). */
export function filtrosAParams(f: FiltrosGlobales): Record<(typeof CLAVES_FILTRO)[number], string | undefined> {
  const csv = (x: string[]) => (x.length ? x.join(',') : undefined)
  return {
    p: f.preset === 'este_mes' ? undefined : f.preset,
    d: f.preset === 'personalizado' ? f.desde : undefined,
    h: f.preset === 'personalizado' ? f.hasta : undefined,
    a: csv(f.ambitos),
    c: csv(f.categorias),
    s: csv(f.subcategorias),
    m: csv(f.medios),
    t: csv(f.tipos),
    r: f.recurrente === 'todos' ? undefined : f.recurrente,
  }
}

export function filtrosAQuery(f: FiltrosGlobales): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filtrosAParams(f))) if (v) q.set(k, v)
  return q.toString()
}

/** Solo los parámetros de filtro de unos parámetros cualquiera (para arrastrarlos al cambiar de pantalla). */
export function soloFiltros(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of CLAVES_FILTRO) {
    const v = params.get(k)
    if (v) out[k] = v
  }
  return out
}

/** Enlace a otra pantalla conservando los filtros de la actual. Catálogo y Configuración no los usan. */
export function enlaceConFiltros(path: string, params: URLSearchParams): string {
  if (path === '/catalogo' || path === '/configuracion' || path === '/mas') return `#${path}`
  const q = new URLSearchParams(soloFiltros(params)).toString()
  return q ? `#${path}?${q}` : `#${path}`
}

export function hayFiltrosActivos(f: FiltrosGlobales): boolean {
  return f.preset !== 'este_mes' || f.ambitos.length > 0 || f.categorias.length > 0 || f.subcategorias.length > 0 || f.medios.length > 0 || f.tipos.length > 0 || f.recurrente !== 'todos'
}

/** Filtro para el motor. «Todo» usa el rango de los datos hasta hoy. */
export function filtrosAMotor(f: FiltrosGlobales, hoy: string, primeraFecha?: string): Filtro {
  const todo = f.preset === 'todo'
  return {
    desde: todo ? (primeraFecha && primeraFecha < hoy ? primeraFecha : hoy) : f.desde,
    hasta: todo ? hoy : f.hasta,
    ambitos: f.ambitos,
    categorias: f.categorias,
    subcategorias: f.subcategorias,
    medios: f.medios,
    tipos: f.tipos,
    recurrente: f.recurrente,
  }
}

export interface Catalogos {
  /** Vínculos ámbito↔categoría (una categoría puede estar en varios ámbitos). */
  ambito_categoria: Array<{ ambito_id: string; categoria_id: string }>
  subcategorias: Array<{ id: string; categoria_id: string }>
}

/** Categorías que pertenecen a alguno de los ámbitos dados. */
export function categoriasDeAmbitos(cat: Catalogos, ambitos: readonly string[]): Set<string> {
  return new Set(cat.ambito_categoria.filter((v) => ambitos.includes(v.ambito_id)).map((v) => v.categoria_id))
}

/** Quita lo que ya no es coherente: categorías fuera de los ámbitos elegidos y subcategorías fuera de las categorías elegidas. */
export function depurarDependientes(f: FiltrosGlobales, cat: Catalogos): FiltrosGlobales {
  let categorias = f.categorias
  if (f.ambitos.length) {
    const ok = categoriasDeAmbitos(cat, f.ambitos)
    categorias = categorias.filter((c) => ok.has(c))
  }
  let subcategorias = f.subcategorias
  const origen = categorias.length ? new Set(categorias) : f.ambitos.length ? categoriasDeAmbitos(cat, f.ambitos) : null
  if (origen) {
    const ok = new Set(cat.subcategorias.filter((s) => origen.has(s.categoria_id)).map((s) => s.id))
    subcategorias = subcategorias.filter((s) => ok.has(s))
  }
  return { ...f, categorias, subcategorias }
}

export function moverFiltros(f: FiltrosGlobales, direccion: -1 | 1): FiltrosGlobales {
  if (f.preset === 'todo') return f
  const p = moverPeriodo({ preset: f.preset, desde: f.desde, hasta: f.hasta }, direccion)
  return { ...f, preset: 'personalizado', desde: p.desde, hasta: p.hasta }
}

/** Lee los filtros de la URL actual y ofrece `cambiar` (conserva el resto de parámetros, p. ej. `resaltar`). */
export function useFiltros(hoy: string) {
  const ruta = useRuta()
  const filtros = useMemo(() => leerFiltros(ruta.params, hoy), [ruta.params, hoy])
  const cambiar = useCallback(
    (nuevo: FiltrosGlobales, opciones: { reemplazar?: boolean } = {}) => {
      const otros: Record<string, string | undefined> = {}
      ruta.params.forEach((v, k) => {
        if (!(CLAVES_FILTRO as readonly string[]).includes(k)) otros[k] = v
      })
      navegar(ruta.path, { ...otros, ...filtrosAParams(nuevo) }, { reemplazar: opciones.reemplazar })
    },
    [ruta.params, ruta.path],
  )
  return { filtros, cambiar, ruta }
}
