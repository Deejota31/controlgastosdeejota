/**
 * Barrera de producción: ninguna prueba que escriba puede apuntar a la hoja real.
 * El ID de la hoja de producción NO se guarda en el repositorio: solo su huella SHA-256.
 * Una suite de escritura debe llamar a `exigirEntornoDePrueba(idDeHoja)` antes de escribir; si el ID es el de
 * producción (o si se le pasa una URL/ID que lo contiene) la suite falla de inmediato.
 */
import { createHash } from 'node:crypto'

export const HUELLA_HOJA_PRODUCCION = '7447198c8e26bb78d920d416f4372c503fee3aca60b7c49113000836d7855d82'

export const huella = (texto) => createHash('sha256').update(String(texto)).digest('hex')

/** true si el texto es, o contiene como "palabra", el ID de la hoja de producción. */
export function esHojaDeProduccion(texto, huellaObjetivo = HUELLA_HOJA_PRODUCCION) {
  const t = String(texto ?? '')
  if (huella(t.trim()) === huellaObjetivo) return true
  for (const palabra of t.match(/[A-Za-z0-9_-]{30,60}/g) ?? []) {
    if (huella(palabra) === huellaObjetivo) return true
  }
  return false
}

export function exigirEntornoDePrueba(idOUrl, contexto = 'una prueba de escritura', huellaObjetivo = HUELLA_HOJA_PRODUCCION) {
  if (esHojaDeProduccion(idOUrl, huellaObjetivo)) {
    throw new Error(
      `BARRERA DE PRODUCCIÓN: ${contexto} apunta a la hoja real de Deejota Finanzas. ` +
        'Las pruebas de escritura solo pueden usar una hoja de pruebas (copia o libro nuevo). Se aborta sin escribir nada.',
    )
  }
}
