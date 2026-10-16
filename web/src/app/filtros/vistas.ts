import { filtrosAQuery, leerFiltros, type FiltrosGlobales } from '@/lib/filtros'

export interface VistaGuardada {
  id: string
  nombre: string
  query: string
}

export const CLAVE_VISTAS = 'vistas_filtros'
export const MAX_VISTAS = 20

/** Lee las vistas de la configuración; ante datos corruptos devuelve lista vacía (nunca rompe la pantalla). */
export function leerVistas(config: Record<string, string>): VistaGuardada[] {
  try {
    const raw = JSON.parse(config[CLAVE_VISTAS] || '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((v): v is VistaGuardada => !!v && typeof v === 'object' && typeof (v as VistaGuardada).id === 'string' && typeof (v as VistaGuardada).nombre === 'string' && typeof (v as VistaGuardada).query === 'string')
  } catch {
    return []
  }
}

export function validarNombreVista(nombre: string, vistas: readonly VistaGuardada[]): string | null {
  const n = nombre.trim()
  if (!n) return 'Escribe un nombre para la vista.'
  if (n.length > 40) return 'Usa 40 caracteres como máximo.'
  if (/^[=+\-@]/.test(n)) return 'El nombre no puede empezar por = + - @.'
  if (vistas.some((v) => v.nombre.toLowerCase() === n.toLowerCase())) return 'Ya tienes una vista con ese nombre.'
  if (vistas.length >= MAX_VISTAS) return `Puedes guardar hasta ${MAX_VISTAS} vistas.`
  return null
}

export const consultaDeVista = (f: FiltrosGlobales): string => filtrosAQuery(f)
export const filtrosDeVista = (v: VistaGuardada, hoy: string): FiltrosGlobales => leerFiltros(new URLSearchParams(v.query), hoy)

/** Vista cuya consulta coincide exactamente con los filtros actuales (para marcarla como activa). */
export function vistaActiva(vistas: readonly VistaGuardada[], f: FiltrosGlobales, hoy: string): VistaGuardada | undefined {
  const actual = filtrosAQuery(f)
  return vistas.find((v) => filtrosAQuery(filtrosDeVista(v, hoy)) === actual)
}
