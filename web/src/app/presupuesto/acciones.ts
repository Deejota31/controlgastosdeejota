import type { Caja, Fuente, Hojas } from '@/api/esquemas'
import { useDatos } from '@/store/datos'
import { toast } from '@/store/toasts'

/** Carga completa para `fuente.guardar` partiendo de la fila actual (el servidor exige todos los datos y la versión). */
export function payloadFuente(h: Hojas, f: Fuente, cambios: Partial<Pick<Fuente, 'activo' | 'es_principal'>> = {}): Record<string, unknown> {
  const activo = cambios.activo ?? f.activo
  return {
    id: f.id,
    nombre: f.nombre,
    monto_defecto: f.monto_defecto,
    moneda: f.moneda,
    recurrencia: f.recurrencia,
    mes_inicio: f.mes_inicio,
    mes_fin: f.mes_fin,
    activo,
    // Una fuente inactiva no puede ser la principal.
    es_principal: activo ? (cambios.es_principal ?? f.es_principal) : false,
    medios: h.fuente_medios.filter((x) => x.fuente_id === f.id).map((x) => x.medio_pago_id),
    icono: f.icono,
    color: f.color,
    version: f.version,
  }
}

export function payloadCaja(c: Caja, cambios: Partial<Pick<Caja, 'activo'>> = {}): Record<string, unknown> {
  return {
    id: c.id,
    nombre: c.nombre,
    alcance: c.alcance,
    alcance_id: c.alcance_id,
    monto_defecto: c.monto_defecto,
    descripcion: c.descripcion,
    activo: cambios.activo ?? c.activo,
    icono: c.icono,
    color: c.color,
    version: c.version,
  }
}

/** Envía una escritura y avisa del resultado. Devuelve los datos si el servidor la aceptó, o null si falló. */
export async function ejecutar<T = Record<string, unknown>>(accion: string, payload: Record<string, unknown>, okMensaje?: string): Promise<T | null> {
  const r = await useDatos.getState().mutar<T>(accion, payload)
  if (!r.ok) {
    toast.error(`No se pudo completar: ${r.error.message}`)
    return null
  }
  if (okMensaje) toast.ok(okMensaje)
  return r.data
}

/** Nuevo orden de ids al subir o bajar una posición; null si ya está en el extremo. */
export function moverUno(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= ids.length) return null
  const salida = ids.slice()
  ;[salida[i], salida[j]] = [salida[j]!, salida[i]!]
  return salida
}
