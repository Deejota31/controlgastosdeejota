import type { Hojas } from '@/api/esquemas'
import { normalizarBusqueda } from '@/lib/texto'

export interface Contador {
  activas: number
  total: number
}

export const claveNombre = (s: string) => normalizarBusqueda(s).replace(/\s+/g, ' ')
export const esOtros = (nombre: string) => claveNombre(nombre) === 'otros'

type Cat = Pick<Hojas, 'ambitos' | 'categorias' | 'ambito_categoria' | 'subcategorias' | 'ambito_subcategoria' | 'medios_pago'>

export function contadores(h: Cat, ambitoId: string) {
  const vinc = h.ambito_categoria.filter((v) => v.ambito_id === ambitoId)
  const catIds = new Set(vinc.map((v) => v.categoria_id))
  const activaCat = new Set(vinc.filter((v) => v.activo).map((v) => v.categoria_id))
  const subs = h.subcategorias.filter((s) => catIds.has(s.categoria_id))
  const subActiva = (id: string, global: boolean) => {
    const f = h.ambito_subcategoria.find((x) => x.ambito_id === ambitoId && x.subcategoria_id === id)
    return global && (f ? f.activo : true)
  }
  const c = (a: number, t: number): Contador => ({ activas: a, total: t })
  return {
    ambitos: c(h.ambitos.filter((a) => a.activo).length, h.ambitos.length),
    categorias: c(activaCat.size, catIds.size),
    // Una subcategoría solo cuenta como activa si su categoría también lo está en este ámbito.
    subcategorias: c(subs.filter((s) => activaCat.has(s.categoria_id) && subActiva(s.id, s.activo)).length, subs.length),
    medios: c(h.medios_pago.filter((m) => m.activo).length, h.medios_pago.length),
  }
}

/** ¿Hay otro elemento del mismo nivel con ese nombre (sin distinguir mayúsculas, tildes ni espacios repetidos)? */
export function nombreRepetido(existentes: ReadonlyArray<{ id: string; nombre: string }>, nombre: string, excluirId?: string): boolean {
  const k = claveNombre(nombre)
  return existentes.some((e) => e.id !== excluirId && claveNombre(e.nombre) === k)
}

/**
 * Nuevo orden de ids al mover `id` una posición. «Otros» siempre queda al final: no se mueve ni se puede
 * pasar por encima de él. Devuelve null si el movimiento no es posible.
 */
export function moverId(items: ReadonlyArray<{ id: string; nombre: string }>, id: string, dir: -1 | 1): string[] | null {
  const ids = items.map((i) => i.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return null
  if (esOtros(items[i]!.nombre) || esOtros(items[j]!.nombre)) return null
  const out = ids.slice()
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

/** Divide un texto en partes para resaltar las coincidencias de una búsqueda (sin tildes ni mayúsculas). */
export function partesResaltadas(texto: string, busqueda: string): Array<{ t: string; ok: boolean }> {
  const q = normalizarBusqueda(busqueda)
  if (!q) return [{ t: texto, ok: false }]
  // normalizar carácter a carácter para conservar las posiciones del texto original
  const mapa: number[] = []
  let norm = ''
  for (let i = 0; i < texto.length; i++) {
    const n = normalizarBusqueda(texto[i]!)
    for (const ch of n) {
      norm += ch
      mapa.push(i)
    }
  }
  const partes: Array<{ t: string; ok: boolean }> = []
  let desde = 0
  let pos = norm.indexOf(q)
  while (pos !== -1) {
    const ini = mapa[pos]!
    const fin = mapa[pos + q.length - 1]! + 1
    if (ini > desde) partes.push({ t: texto.slice(desde, ini), ok: false })
    partes.push({ t: texto.slice(ini, fin), ok: true })
    desde = fin
    pos = norm.indexOf(q, pos + q.length)
  }
  if (desde < texto.length) partes.push({ t: texto.slice(desde), ok: false })
  return partes.length ? partes : [{ t: texto, ok: false }]
}

export interface DependenciasServidor {
  movimientos?: number
  cajas?: number
  plantillas?: number
  fuentes?: number
  compromisos?: number
}

export function describirDependencias(d: DependenciasServidor): string {
  const partes: string[] = []
  const add = (n: number | undefined, uno: string, varios: string) => n && partes.push(`${n} ${n === 1 ? uno : varios}`)
  add(d.movimientos, 'movimiento', 'movimientos')
  add(d.cajas, 'caja', 'cajas')
  add(d.plantillas, 'plantilla', 'plantillas')
  add(d.fuentes, 'fuente', 'fuentes')
  add(d.compromisos, 'compromiso', 'compromisos')
  return partes.join(', ')
}
