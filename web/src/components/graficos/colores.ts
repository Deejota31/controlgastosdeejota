/** Paleta categórica distinguible en claro y oscuro, también para daltonismo (varía luminosidad y tono). */
export const PALETA = ['#2563eb', '#14b8a6', '#f59e0b', '#a855f7', '#ef4444', '#22c55e', '#ec4899', '#64748b', '#0ea5e9', '#84cc16']
const HEX = /^#[0-9a-fA-F]{6}$/

/** Color de una entidad: el suyo si es un hex válido, si no uno de la paleta por posición. */
export const colorDe = (color: string | undefined, indice: number): string => (color && HEX.test(color) ? color : PALETA[indice % PALETA.length]!)
