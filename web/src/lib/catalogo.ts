import type { Ambito, AmbitoCategoria, AmbitoSubcategoria, Categoria, Subcategoria } from '@/api/esquemas'

interface Cat {
  ambitos: Ambito[]
  categorias: Categoria[]
  ambito_categoria: AmbitoCategoria[]
  subcategorias: Subcategoria[]
  ambito_subcategoria: AmbitoSubcategoria[]
}

/** Categorías vinculadas y activas en el ámbito, en el orden configurado. */
export function categoriasDeAmbito(h: Pick<Cat, 'categorias' | 'ambito_categoria'>, ambitoId: string, incluir?: string): Categoria[] {
  const vin = h.ambito_categoria.filter((v) => v.ambito_id === ambitoId && (v.activo || v.categoria_id === incluir)).sort((a, b) => a.orden - b.orden)
  const porId = new Map(h.categorias.map((c) => [c.id, c]))
  return vin.map((v) => porId.get(v.categoria_id)).filter((c): c is Categoria => !!c)
}

/** Subcategorías efectivas: activas globalmente y en el ámbito (sin fila = hereda el estado global). */
export function subcategoriasEfectivas(h: Pick<Cat, 'subcategorias' | 'ambito_subcategoria'>, categoriaId: string, ambitoId: string, incluir?: string): Subcategoria[] {
  const activaEnAmbito = (id: string) => {
    const f = h.ambito_subcategoria.find((x) => x.ambito_id === ambitoId && x.subcategoria_id === id)
    return f ? f.activo : true
  }
  return h.subcategorias
    .filter((s) => s.categoria_id === categoriaId && ((s.activo && activaEnAmbito(s.id)) || s.id === incluir))
    .sort((a, b) => a.orden - b.orden)
}

/** Monedas que se pueden usar: la base primero, luego las permitidas. */
export function monedasPermitidas(config: Record<string, string>): string[] {
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  const lista = (config['monedas_permitidas'] || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  return [base, ...lista.filter((m) => m !== base)]
}

/** Tipo de cambio a la moneda base; null si no está configurado. */
export function tipoCambioDe(config: Record<string, string>, moneda: string): number | null {
  const base = (config['moneda_base'] || 'PEN').toUpperCase()
  if (moneda === base) return 1
  const t = Number(config['tipo_cambio_' + moneda])
  return t > 0 ? t : null
}

/** Enlace permitido en comprobantes: https, sin espacios ni comillas, 3–480 caracteres tras el esquema. */
export function urlComprobanteValida(v: string): boolean {
  return v === '' || /^https:\/\/[^\s"'<>]{3,480}$/.test(v)
}
