import type { Hojas } from '@/api/esquemas'

export type DatosMotor = Omit<Hojas, 'config'> & { config: Record<string, string> }

/** Movimiento preparado para cálculos: céntimos enteros en moneda base y claves ya resueltas. */
export interface MovC {
  id: string
  fecha: string
  mes: string
  /** Monto en la moneda base, en céntimos. null si no hay tipo de cambio (se excluye y se avisa). */
  cents: number | null
  /** Monto original (en su moneda) y la moneda: se usan para detectar duplicados. */
  montoOrig: number
  moneda: string
  ambito: string
  categoria: string
  sub: string
  medio: string
  tipo: 'fijo' | 'variable' | 'extraordinario'
  recurrente: boolean
  anulado: boolean
  descripcion: string
}

export interface Avisos {
  /** Movimientos activos excluidos de los totales por no tener tipo de cambio. */
  sinTipoCambio: string[]
  /** Fuentes del mes excluidas por falta de tipo de cambio. */
  fuentesSinTipoCambio: string[]
  /** Cajas activas con el mismo alcance (no se permite). */
  solapamientos: Array<{ alcance: string; alcanceId: string; cajaIds: string[] }>
}

export interface Filtro {
  desde: string
  hasta: string
  ambitos?: string[]
  categorias?: string[]
  subcategorias?: string[]
  medios?: string[]
  tipos?: Array<MovC['tipo']>
  recurrente?: 'todos' | 'si' | 'no'
  texto?: string
}
