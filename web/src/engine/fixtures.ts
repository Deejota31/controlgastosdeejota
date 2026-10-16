import type { Caja, CajaMes, Fuente, FuenteMedio, FuenteMes, Hojas, Movimiento } from '@/api/esquemas'
import { hojasVacias } from '@/api/esquemas'
import type { DatosMotor } from './tipos'

/** Constructores de datos para pruebas y benchmarks (no se incluyen en el bundle de la app). */
const T = '2026-01-01T00:00:00.000Z'
let n = 0
const id = (p: string) => `${p}-${String(++n).padStart(8, '0')}`

export function mov(p: Partial<Movimiento> = {}): Movimiento {
  const monto = p.monto ?? 10
  return {
    id: id('mov'), fecha: '2026-10-05', monto, moneda: 'PEN', tipo_cambio: 1, monto_base: monto, ambito_id: 'amb-personal', categoria_id: 'cat-alim',
    subcategoria_id: 'sub-almuerzo', descripcion: 'Menú', medio_pago_id: 'med-yape', tipo_gasto: 'variable', es_recurrente: false, estado: 'activo',
    origen: 'web', plantilla_id: '', lote_id: '', comprobante_url: '', notas: '', creado_en: T, actualizado_en: T, version: 1, ...p,
  }
}
export function fuente(p: Partial<Fuente> = {}): Fuente {
  return {
    id: id('fte'), nombre: 'Sueldo', monto_defecto: 1000, moneda: 'PEN', recurrencia: 'mensual', mes_inicio: '2026-01', mes_fin: '', icono: 'wallet',
    color: '#1E3A8A', orden: 1, activo: true, es_principal: false, creado_en: T, actualizado_en: T, version: 1, ...p,
  }
}
export function fuenteMes(fuenteId: string, mes: string, monto: number, estado: 'aplicada' | 'omitida' = 'aplicada'): FuenteMes {
  return { id: id('fm'), fuente_id: fuenteId, mes, monto, estado, actualizado_en: T }
}
export function fuenteMedio(fuenteId: string, medioId: string): FuenteMedio {
  return { id: id('fmd'), fuente_id: fuenteId, medio_pago_id: medioId, orden: 1 }
}
export function caja(p: Partial<Caja> = {}): Caja {
  return {
    id: id('caja'), nombre: 'Caja', alcance: 'categoria', alcance_id: 'cat-alim', monto_defecto: 100, icono: 'piggy-bank', color: '#14B8A6',
    descripcion: '', orden: 1, activo: true, creado_en: T, actualizado_en: T, version: 1, ...p,
  }
}
export function cajaMes(cajaId: string, mes: string, monto: number, estado: 'aplicada' | 'omitida' = 'aplicada'): CajaMes {
  return { id: id('cm'), caja_id: cajaId, mes, monto, estado, actualizado_en: T }
}

export function datos(p: Partial<Omit<Hojas, 'config'>> & { config?: Record<string, string> } = {}): DatosMotor {
  const { config, ...resto } = p
  const { config: _filas, ...vacias } = hojasVacias()
  return { ...vacias, ...resto, config: { moneda_base: 'PEN', ...config } }
}

/** PRNG determinista (mulberry32) para escenarios reproducibles. */
export function prng(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
